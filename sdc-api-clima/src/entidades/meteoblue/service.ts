import { Injectable, Logger } from '@nestjs/common';
import {
  ICalidadDatoMotor,
  IComparacionFuentesClimaticas,
  IComparacionVariableClimatica,
  ICoordenadas,
  IPronosticoEstacionMeteorologica,
  crearCalidadDatoMotor,
} from 'modelos/src';
import { API_OPEN_METEO } from '../../env';
import {
  IMeteoblueDailyResponse,
  MeteoblueRepository,
} from './repository';
import { RateLimiterService } from '../../auxiliares/rate-limiter/rate-limiter.service';

type DailySource = 'openMeteo' | 'meteoblue';

@Injectable()
export class MeteoblueService {
  private readonly logger = new Logger(MeteoblueService.name);

  constructor(
    private repository: MeteoblueRepository,
    private rateLimiter: RateLimiterService,
  ) {}

  public isConfigured(): boolean {
    return this.repository.isConfigured();
  }

  public async getPronostico(
    ubicacion: ICoordenadas,
    dias: number = 7,
  ): Promise<IPronosticoEstacionMeteorologica[]> {
    const data = await this.rateLimiter.addClimateRequest(
      () => this.repository.getDailyForecast(ubicacion, dias),
      ubicacion.lat,
      ubicacion.lng,
    );

    return this.parsearPronosticoMeteoblue(data, ubicacion, dias);
  }

  public async compararConOpenMeteo(
    ubicacion: ICoordenadas,
    dias: number = 7,
  ): Promise<IComparacionFuentesClimaticas> {
    const [openMeteo, meteoblue] = await Promise.all([
      this.getPronosticoOpenMeteo(ubicacion, dias),
      this.getPronosticoSeguro(ubicacion, dias),
    ]);

    const comparaciones = this.compararPronosticos(openMeteo, meteoblue);
    const calidadDatos = this.calcularCalidadComparacion(
      openMeteo,
      meteoblue,
      comparaciones,
    );

    return {
      lat: ubicacion.lat,
      lng: ubicacion.lng,
      generadoEn: new Date().toISOString(),
      diasSolicitados: dias,
      fuentesConsultadas: meteoblue.length
        ? ['OpenMeteo', 'Meteoblue']
        : ['OpenMeteo'],
      fuentePreferida: meteoblue.length ? 'Meteoblue' : 'OpenMeteo',
      meteoblueDisponible: meteoblue.length > 0,
      calidadDatos,
      resumen: calidadDatos.resumen || 'Comparacion climatica sin resumen.',
      pronosticos: {
        openMeteo,
        meteoblue,
      },
      comparaciones,
    };
  }

  public async checkApi() {
    return this.repository.checkApi();
  }

  private async getPronosticoSeguro(
    ubicacion: ICoordenadas,
    dias: number,
  ): Promise<IPronosticoEstacionMeteorologica[]> {
    try {
      return await this.getPronostico(ubicacion, dias);
    } catch (error) {
      this.logger.warn(`Meteoblue no disponible para comparacion: ${error}`);
      return [];
    }
  }

  private parsearPronosticoMeteoblue(
    data: IMeteoblueDailyResponse | null,
    ubicacion: ICoordenadas,
    dias: number,
  ): IPronosticoEstacionMeteorologica[] {
    const dataDay = data?.data_day;
    const fechas = this.array(dataDay?.time).slice(0, dias);
    if (!fechas.length) {
      return [];
    }

    return fechas.map((fechaRaw, index) => {
      const fecha = this.toFechaIso(fechaRaw);
      return {
        fuente: 'Meteoblue',
        fecha,
        estacion: 'Meteoblue API',
        ubicacion,
        temperatura: {
          min: this.valor(dataDay, index, [
            'temperature_min',
            'temperature_2m_min',
          ]),
          max: this.valor(dataDay, index, [
            'temperature_max',
            'temperature_2m_max',
          ]),
          avg: this.valor(dataDay, index, [
            'temperature_mean',
            'temperature_avg',
            'temperature',
          ]),
        },
        humedad: {
          avg: this.valor(dataDay, index, [
            'relativehumidity_mean',
            'relative_humidity_mean',
            'relativehumidity',
          ]),
        },
        velocidadViento: {
          avg: this.valor(dataDay, index, ['windspeed_mean', 'wind_speed_mean']),
          max: this.valor(dataDay, index, ['windspeed_max', 'wind_speed_max']),
        },
        direccionViento: this.valor(dataDay, index, [
          'winddirection',
          'winddirection_mean',
          'wind_direction',
        ]),
        lluvia: this.valor(dataDay, index, [
          'precipitation',
          'precipitation_sum',
          'rain',
        ]),
        probabilidadLluvia: this.valor(dataDay, index, [
          'precipitation_probability',
          'precipitation_probability_max',
        ]),
        radiacionSolar: this.valor(dataDay, index, [
          'globalradiation',
          'shortwave_radiation',
        ]),
        et0: this.valor(dataDay, index, [
          'et0_fao_evapotranspiration',
          'referenceevapotranspiration',
          'evapotranspiration',
        ]),
        calidadDatos: crearCalidadDatoMotor({
          nivel: 'alta',
          fuente: 'meteoblue',
          score: 85,
          cobertura: 100,
          fechaActualizacion: new Date().toISOString(),
          resumen:
            'Fuente profesional Meteoblue por coordenada. Validar contra estacion de campo cuando exista.',
        }),
      };
    });
  }

  private async getPronosticoOpenMeteo(
    ubicacion: ICoordenadas,
    dias: number,
  ): Promise<IPronosticoEstacionMeteorologica[]> {
    const url = new URL(`${API_OPEN_METEO}/forecast`);
    url.searchParams.set('latitude', `${ubicacion.lat}`);
    url.searchParams.set('longitude', `${ubicacion.lng}`);
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', `${Math.max(1, Math.min(14, dias))}`);
    url.searchParams.set(
      'daily',
      [
        'temperature_2m_max',
        'temperature_2m_min',
        'temperature_2m_mean',
        'relative_humidity_2m_mean',
        'precipitation_sum',
        'precipitation_probability_max',
        'wind_speed_10m_max',
        'wind_speed_10m_mean',
        'wind_direction_10m_dominant',
        'shortwave_radiation_sum',
        'et0_fao_evapotranspiration',
      ].join(','),
    );

    const response = await fetch(url);
    if (!response.ok) {
      this.logger.warn(`Open-Meteo comparacion respondio ${response.status}`);
      return [];
    }

    const data = await response.json();
    const daily = data?.daily || {};
    const fechas: string[] = daily.time || [];

    return fechas.slice(0, dias).map((fecha, index) => ({
      fuente: 'OpenMeteo' as any,
      fecha: new Date(`${fecha}T12:00:00`).toISOString(),
      estacion: 'Open-Meteo',
      ubicacion,
      temperatura: {
        min: this.numero(daily.temperature_2m_min?.[index]),
        max: this.numero(daily.temperature_2m_max?.[index]),
        avg: this.numero(daily.temperature_2m_mean?.[index]),
      },
      humedad: {
        avg: this.numero(daily.relative_humidity_2m_mean?.[index]),
      },
      velocidadViento: {
        avg: this.numero(daily.wind_speed_10m_mean?.[index]),
        max: this.numero(daily.wind_speed_10m_max?.[index]),
      },
      direccionViento: this.numero(daily.wind_direction_10m_dominant?.[index]),
      lluvia: this.numero(daily.precipitation_sum?.[index]),
      probabilidadLluvia: this.numero(
        daily.precipitation_probability_max?.[index],
      ),
      radiacionSolar: this.numero(daily.shortwave_radiation_sum?.[index]),
      et0: this.numero(daily.et0_fao_evapotranspiration?.[index]),
      calidadDatos: crearCalidadDatoMotor({
        nivel: 'media',
        fuente: 'open_meteo',
        score: 68,
        cobertura: 100,
        fechaActualizacion: new Date().toISOString(),
        fallback: true,
        resumen:
          'Modelo abierto por coordenada; buena continuidad, menor confianza que sensor de campo o fuente agronomica paga.',
      }),
    }));
  }

  private compararPronosticos(
    openMeteo: IPronosticoEstacionMeteorologica[],
    meteoblue: IPronosticoEstacionMeteorologica[],
  ): IComparacionVariableClimatica[] {
    const out: IComparacionVariableClimatica[] = [];
    const meteobluePorFecha = new Map(
      meteoblue.map((dia) => [this.fechaDia(dia.fecha), dia]),
    );

    for (const diaOpen of openMeteo) {
      const dia = this.fechaDia(diaOpen.fecha);
      const diaMeteoblue = meteobluePorFecha.get(dia);
      this.pushComparacion(out, dia, 'temperaturaMedia', 'C', diaOpen.temperatura?.avg, diaMeteoblue?.temperatura?.avg, 3);
      this.pushComparacion(out, dia, 'temperaturaMin', 'C', diaOpen.temperatura?.min, diaMeteoblue?.temperatura?.min, 3);
      this.pushComparacion(out, dia, 'temperaturaMax', 'C', diaOpen.temperatura?.max, diaMeteoblue?.temperatura?.max, 3);
      this.pushComparacion(out, dia, 'lluvia', 'mm', diaOpen.lluvia, diaMeteoblue?.lluvia, 8);
      this.pushComparacion(out, dia, 'probabilidadLluvia', '%', diaOpen.probabilidadLluvia, diaMeteoblue?.probabilidadLluvia, 25);
      this.pushComparacion(out, dia, 'et0', 'mm', diaOpen.et0, diaMeteoblue?.et0, 2);
      this.pushComparacion(out, dia, 'viento', 'km/h', diaOpen.velocidadViento?.avg, diaMeteoblue?.velocidadViento?.avg, 12);
    }

    return out;
  }

  private pushComparacion(
    out: IComparacionVariableClimatica[],
    fecha: string,
    variable: IComparacionVariableClimatica['variable'],
    unidad: string,
    openMeteo?: number,
    meteoblue?: number,
    umbralDesvioAbs: number = 0,
  ) {
    const ambos = this.esNumero(openMeteo) && this.esNumero(meteoblue);
    const diferenciaAbs = ambos
      ? Math.abs(Number(openMeteo) - Number(meteoblue))
      : undefined;
    const base = ambos ? Math.max(Math.abs(Number(openMeteo)), 0.1) : 0;
    const diferenciaPct = ambos ? (diferenciaAbs! / base) * 100 : undefined;
    out.push({
      fecha,
      variable,
      unidad,
      openMeteo,
      meteoblue,
      diferenciaAbs: this.redondear(diferenciaAbs),
      diferenciaPct: this.redondear(diferenciaPct),
      estado: !ambos
        ? 'sin_datos'
        : diferenciaAbs! > umbralDesvioAbs
          ? 'desvio'
          : 'ok',
    });
  }

  private calcularCalidadComparacion(
    openMeteo: IPronosticoEstacionMeteorologica[],
    meteoblue: IPronosticoEstacionMeteorologica[],
    comparaciones: IComparacionVariableClimatica[],
  ): ICalidadDatoMotor {
    if (!openMeteo.length && !meteoblue.length) {
      return crearCalidadDatoMotor({
        nivel: 'sin_datos',
        fuente: 'desconocida',
        score: 0,
        resumen: 'No hay fuentes climaticas disponibles para el punto.',
      });
    }

    if (!meteoblue.length) {
      return crearCalidadDatoMotor({
        nivel: 'media',
        fuente: 'open_meteo',
        score: 62,
        cobertura: openMeteo.length ? 100 : 0,
        fallback: true,
        resumen:
          'Chamán opera con Open-Meteo. Meteoblue no esta configurado o no respondio, por lo que no hay contraste profesional.',
        limitaciones: [
          'Sin sensor de campo asignado.',
          'Sin segunda fuente para comparar desvios de lluvia, ET0 y temperatura.',
        ],
      });
    }

    const conDatos = comparaciones.filter((item) => item.estado !== 'sin_datos');
    const desvio = conDatos.filter((item) => item.estado === 'desvio');
    const desvioPct = conDatos.length ? desvio.length / conDatos.length : 0;
    const score = Math.max(55, Math.round(88 - desvioPct * 30));
    const nivel = score >= 80 ? 'alta' : score >= 65 ? 'media' : 'baja';

    return crearCalidadDatoMotor({
      nivel,
      fuente: 'mixto',
      score,
      cobertura: Math.round((conDatos.length / Math.max(comparaciones.length, 1)) * 100),
      fechaActualizacion: new Date().toISOString(),
      resumen:
        desvio.length === 0
          ? 'Open-Meteo y Meteoblue son consistentes para las variables evaluadas.'
          : `Se detectaron ${desvio.length} desvio(s) relevantes entre Open-Meteo y Meteoblue; revisar variables sensibles antes de emitir alertas criticas.`,
      limitaciones: [
        'La comparacion no reemplaza sensores de campo.',
        'Meteoblue aporta contraste profesional por coordenada cuando la API key esta configurada.',
      ],
    });
  }

  private valor(
    dataDay: Record<string, unknown[]> | undefined,
    index: number,
    keys: string[],
  ): number | undefined {
    for (const key of keys) {
      const value = dataDay?.[key]?.[index];
      const parsed = this.numero(value);
      if (parsed !== undefined) return parsed;
    }
    return undefined;
  }

  private array(value: unknown): string[] {
    return Array.isArray(value) ? value.map((item) => String(item)) : [];
  }

  private numero(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private esNumero(value: unknown): boolean {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private redondear(value?: number): number | undefined {
    return this.esNumero(value) ? Math.round(Number(value) * 100) / 100 : undefined;
  }

  private toFechaIso(value: string): string {
    const raw = value.includes('T') ? value : `${value.slice(0, 10)}T12:00:00`;
    const date = new Date(raw);
    return Number.isFinite(date.getTime())
      ? date.toISOString()
      : new Date().toISOString();
  }

  private fechaDia(value?: string): string {
    return value ? new Date(value).toISOString().slice(0, 10) : '';
  }
}
