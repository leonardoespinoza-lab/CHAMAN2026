import { Injectable, Logger } from '@nestjs/common';
import {
  esCultivoPerenne,
  evaluarRiesgoGranizoAgroclimatico,
  IRiesgoAgroclimatico,
  IResumenRiesgosAgroclimaticos,
  ISerieFrioTermicoDia,
  ISiembra,
  NivelRiesgoAgroclimatico,
  resolverContextoHeladaFenologico,
} from 'modelos/src';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { PREDICCIONES_AGROCLIMA_LIMIT } from '../../env';
import { AlertasService } from '../alerta/service';
import { NotificacionsService } from '../notificacion/service';
import { SiembrasService } from '../siembra/service';

@Injectable()
export class AgroclimaService {
  private readonly logger = new Logger(AgroclimaService.name);
  private readonly timezone = 'America/Argentina/Buenos_Aires';
  private readonly forecastCache = new Map<
    string,
    { expiresAt: number; value: ISerieFrioTermicoDia[] }
  >();

  constructor(
    private readonly axios: AxiosService,
    private readonly siembrasService: SiembrasService,
    private readonly alertasService: AlertasService,
    private readonly notificacionesService: NotificacionsService,
  ) {}

  async hacerPredicciones(limit = PREDICCIONES_AGROCLIMA_LIMIT) {
    const siembras =
      await this.siembrasService.listarSiembrasParaAgroclima(limit);
    this.logger.log(
      `Iniciando riesgos agroclimaticos para ${siembras.length} siembras`,
    );

    let procesadas = 0;
    let eventos = 0;
    for (const s of siembras) {
      try {
        const resultado = await this.evaluarSiembra(s._id);
        procesadas += 1;
        eventos += await this.registrarEventos(
          resultado.siembra,
          resultado.riesgos,
        );
      } catch (error) {
        this.logger.error(`Error en riesgo agroclimatico ${s._id}: ${error}`);
      }
    }

    this.logger.log(
      `Riesgos agroclimaticos finalizados: ${procesadas}/${siembras.length}. Eventos: ${eventos}`,
    );
  }

  async evaluarSiembra(
    idSiembra: string,
  ): Promise<{ siembra: ISiembra; riesgos: IResumenRiesgosAgroclimaticos }> {
    const siembra = await this.siembrasService.getById(idSiembra);
    const centro = this.getCentro(siembra);
    if (!centro) {
      throw new Error(`Siembra ${idSiembra} sin coordenadas`);
    }
    const cultivo = siembra.semilla?.cultivo;
    const serie = await this.fetchOpenMeteoAgroForecast(centro.lat, centro.lng);
    return {
      siembra,
      riesgos: {
        fuente: 'OpenMeteo',
        lat: centro.lat,
        lng: centro.lng,
        cultivo,
        generadoEn: new Date().toISOString(),
        helada: this.calcularRiesgoHelada(serie, siembra),
        granizo: this.calcularRiesgoGranizo(serie),
      },
    };
  }

  async evaluarYRegistrar(
    idSiembra: string,
  ): Promise<IResumenRiesgosAgroclimaticos> {
    const resultado = await this.evaluarSiembra(idSiembra);
    await this.registrarEventos(resultado.siembra, resultado.riesgos);
    return resultado.riesgos;
  }

  private async registrarEventos(
    siembra: ISiembra,
    riesgos: IResumenRiesgosAgroclimaticos,
  ): Promise<number> {
    let eventos = 0;
    const fecha = new Date().toISOString();
    const idSiembra = siembra._id;

    if (riesgos.helada?.aplica && riesgos.helada.nivel !== 'bajo') {
      const eventKey = `helada:${idSiembra}:${this.dateKey(fecha)}`;
      await this.alertasService.registrarEventoSiembra({
        idSiembra,
        descripcion: 'Riesgo de Dano por Helada',
        titulo: 'Riesgo de dano por helada',
        tipo: 'helada',
        categoria: 'agroclimatica',
        motor: 'riesgos-agroclimaticos',
        versionMotor: 'v1',
        lectura: riesgos.helada.lectura,
        recomendacion: riesgos.helada.recomendacion,
        calidadDatos: {
          nivel: 'media',
          fuente: 'Open-Meteo / clima de zona',
          detalle:
            'Pronostico agroclimatico de zona; no reemplaza sensor local de temperatura en el lote.',
        },
        fecha,
        eventKey,
        reporte: this.reporteAgroclimatico(riesgos.helada),
        tenant: this.tenant(siembra),
      });
      await this.notificacionesService.enviarEventoAgroclimatico({
        titulo: 'Alerta de dano por helada',
        mensaje: `${siembra.semilla?.cultivo || 'Cultivo'} en ${
          siembra.lote?.nombre || 'lote'
        }: ${riesgos.helada.lectura}`,
        siembra,
        eventKey,
        data: this.dataNotificacion('helada', riesgos.helada, idSiembra),
      });
      eventos += 1;
    }

    if (riesgos.granizo.nivel !== 'bajo') {
      const eventKey = `granizo:${idSiembra}:${this.dateKey(fecha)}`;
      await this.alertasService.registrarEventoSiembra({
        idSiembra,
        descripcion: 'Riesgo de Granizo',
        titulo: 'Riesgo de granizo',
        tipo: 'granizo',
        categoria: 'agroclimatica',
        motor: 'riesgos-agroclimaticos',
        versionMotor: 'v1',
        lectura: riesgos.granizo.lectura,
        recomendacion: riesgos.granizo.recomendacion,
        calidadDatos: {
          nivel: riesgos.granizo.calidadDatos?.nivel || 'baja',
          score: riesgos.granizo.calidadDatos?.score,
          fuente:
            riesgos.granizo.calidadDatos?.fuente ||
            'Open-Meteo / clima de zona',
          detalle:
            riesgos.granizo.calidadDatos?.detalle ||
            'Senal convectiva estimada para la zona; requiere seguimiento meteorologico local.',
        },
        fecha,
        eventKey,
        reporte: this.reporteAgroclimatico(riesgos.granizo),
        tenant: this.tenant(siembra),
      });
      await this.notificacionesService.enviarEventoAgroclimatico({
        titulo: 'Alerta de granizo',
        mensaje: `${siembra.semilla?.cultivo || 'Cultivo'} en ${
          siembra.lote?.nombre || 'lote'
        }: ${riesgos.granizo.lectura}`,
        siembra,
        eventKey,
        data: this.dataNotificacion('granizo', riesgos.granizo, idSiembra),
      });
      eventos += 1;
    }

    return eventos;
  }

  private async fetchOpenMeteoAgroForecast(
    lat: number,
    lng: number,
  ): Promise<ISerieFrioTermicoDia[]> {
    const cacheKey = `${this.round(lat, 4)}|${this.round(lng, 4)}|${this.dateKey()}`;
    const cached = this.forecastCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const url = 'https://api.open-meteo.com/v1/forecast';
    const data = await this.axios.GET<any>(url, {
      params: {
        latitude: lat,
        longitude: lng,
        forecast_days: 7,
        daily:
          'temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,precipitation_probability_max,showers_sum,weather_code,wind_gusts_10m_max',
        hourly:
          'cape,showers,precipitation_probability,weather_code,wind_gusts_10m',
        timezone: this.timezone,
      },
      timeout: 12000,
    });
    const serie = this.normalizarOpenMeteoAgroForecast(data);
    this.forecastCache.set(cacheKey, {
      expiresAt: Date.now() + 20 * 60 * 1000,
      value: serie,
    });
    return serie;
  }

  private normalizarOpenMeteoAgroForecast(data: any): ISerieFrioTermicoDia[] {
    const daily = data?.daily || {};
    const fechas: string[] = daily.time || [];
    const hourly = data?.hourly || {};
    const hourlyByDate = this.agruparHourlyAgro(hourly);
    return fechas.map((fecha, index) => {
      const hourlyDia = hourlyByDate.get(fecha) || {};
      return {
        fecha,
        temperaturaMax: this.round(daily.temperature_2m_max?.[index]),
        temperaturaMin: this.round(daily.temperature_2m_min?.[index]),
        temperaturaMedia: this.round(daily.temperature_2m_mean?.[index]),
        lluvia: this.round(daily.precipitation_sum?.[index] || 0),
        probabilidadLluvia: this.round(
          daily.precipitation_probability_max?.[index] ??
            hourlyDia.probabilidadLluvia,
          0,
        ),
        showers: this.round(daily.showers_sum?.[index] ?? hourlyDia.showers),
        weatherCode: daily.weather_code?.[index] ?? hourlyDia.weatherCode,
        cape: this.round(hourlyDia.cape, 0),
        rafagaViento: this.round(
          daily.wind_gusts_10m_max?.[index] ?? hourlyDia.rafagaViento,
        ),
        esPronostico: true,
      };
    });
  }

  private agruparHourlyAgro(hourly: any): Map<string, Record<string, number>> {
    const result = new Map<string, Record<string, number>>();
    const times: string[] = hourly?.time || [];
    times.forEach((time, index) => {
      const fecha = String(time || '').slice(0, 10);
      if (!fecha) return;
      const item = result.get(fecha) || {};
      item.cape = Math.max(item.cape || 0, Number(hourly.cape?.[index] || 0));
      item.showers = Math.max(
        item.showers || 0,
        Number(hourly.showers?.[index] || 0),
      );
      item.probabilidadLluvia = Math.max(
        item.probabilidadLluvia || 0,
        Number(hourly.precipitation_probability?.[index] || 0),
      );
      item.rafagaViento = Math.max(
        item.rafagaViento || 0,
        Number(hourly.wind_gusts_10m?.[index] || 0),
      );
      const code = Number(hourly.weather_code?.[index]);
      if (Number.isFinite(code) && this.weatherCodeConvectivo(code)) {
        item.weatherCode = code;
      } else if (Number.isFinite(code) && item.weatherCode === undefined) {
        item.weatherCode = code;
      }
      result.set(fecha, item);
    });
    return result;
  }

  private calcularRiesgoHelada(
    serie: ISerieFrioTermicoDia[],
    siembra: ISiembra,
  ): IRiesgoAgroclimatico {
    const cultivo = siembra.semilla?.cultivo;
    const aplica = esCultivoPerenne(cultivo);
    if (!aplica) {
      return {
        tipo: 'helada',
        aplica: false,
        nivel: 'bajo',
        posibilidadPct: 0,
        titulo: 'Heladas',
        lectura: 'Servicio de heladas reservado para cultivos perennes.',
        recomendacion:
          'Para cultivos anuales se mantiene seguimiento climatico general.',
        diasRiesgo: 0,
        evidencia: ['Cultivo sin servicio fenologico de heladas asignado.'],
        serie: [],
      };
    }

    const dias = serie.map((dia) => {
      const contexto = resolverContextoHeladaFenologico({
        cultivo,
        variedad: siembra.semilla?.variedad,
        fecha: dia.fecha,
        fechaSiembra: siembra.fechaSiembra,
        etapasFenologia: siembra.semilla?.fenologiaReferencia?.etapas,
        etapasJuveniles: siembra.semilla?.fenologiaReferencia?.etapasJuveniles,
        edadProductivaDesdeAnios:
          siembra.semilla?.fenologiaReferencia?.edadProductivaDesdeAnios,
        ajusteVarietalC: siembra.semilla?.sensibilidadHelada?.ajusteUmbralC,
        ajustesHeladaPorFase:
          siembra.semilla?.sensibilidadHelada?.ajustesPorFase,
        fuenteAjusteVarietal: siembra.semilla?.sensibilidadHelada?.fuente,
      });
      const posibilidad = this.posibilidadDanoHelada(
        dia.temperaturaMin,
        contexto?.tempDanoLeveC,
        contexto?.tempDanoSeveroC,
      );
      const nivel: NivelRiesgoAgroclimatico =
        posibilidad >= 70 ? 'alto' : posibilidad >= 35 ? 'medio' : 'bajo';
      const margen =
        dia.temperaturaMin !== undefined &&
        contexto?.tempDanoLeveC !== undefined
          ? this.round(dia.temperaturaMin - contexto.tempDanoLeveC)
          : undefined;
      return {
        fecha: dia.fecha,
        nivel,
        posibilidadPct: posibilidad,
        temperaturaMin: dia.temperaturaMin,
        temperaturaMax: dia.temperaturaMax,
        lluvia: dia.lluvia,
        etapaFenologica: contexto?.etapaDetectada,
        contextoFenologico: contexto
          ? `${contexto.cultivo} - ${contexto.etapaDetectada}${contexto.variedad ? ` - ${contexto.variedad}` : ''}`
          : undefined,
        umbralDanoLeveC: contexto?.tempDanoLeveC,
        umbralDanoSeveroC: contexto?.tempDanoSeveroC,
        fuenteUmbral: contexto?.fuente,
        margenUmbralC: margen,
        calibracionVarietal: contexto?.calibracionVarietal,
        ajusteVarietalC: contexto?.ajusteVarietalC,
        fuenteAjusteVarietal: contexto?.fuenteAjusteVarietal,
        evidencia: [
          dia.temperaturaMin !== undefined
            ? `Temperatura minima prevista ${dia.temperaturaMin} C`
            : 'Sin temperatura minima disponible',
          contexto
            ? `Estadio fenologico: ${contexto.etapaDetectada}`
            : 'Sin estadio fenologico disponible',
          contexto?.tempDanoLeveC !== undefined
            ? `Umbral dano inicial ${contexto.tempDanoLeveC} C`
            : 'Sin umbral fenologico disponible',
          contexto?.tempDanoSeveroC !== undefined
            ? `Umbral dano severo ${contexto.tempDanoSeveroC} C`
            : 'Sin umbral severo disponible',
          contexto?.fuente ? `Referencia: ${contexto.fuente}` : '',
          contexto?.calibracionVarietal === 'base_fenologica'
            ? 'Calibracion: base fenologica'
            : `Calibracion varietal: ${contexto?.fuenteAjusteVarietal || 'ajuste cargado'}`,
        ].filter((item): item is string => !!item),
      };
    });
    const critico = [...dias].sort(
      (a, b) => b.posibilidadPct - a.posibilidadPct,
    )[0];
    const nivel =
      critico?.posibilidadPct >= 70
        ? 'alto'
        : critico?.posibilidadPct >= 35
          ? 'medio'
          : 'bajo';
    return {
      tipo: 'helada',
      aplica: true,
      nivel,
      posibilidadPct: critico?.posibilidadPct || 0,
      titulo: 'Riesgo de dano por helada',
      lectura:
        nivel === 'alto'
          ? `${cultivo} en ${critico?.etapaFenologica || 'estadio sensible'}: temperatura bajo umbral de dano.`
          : nivel === 'medio'
            ? `${cultivo} en ${critico?.etapaFenologica || 'estadio actual'}: escenario cercano al umbral de dano.`
            : `${cultivo}: puede haber frio, pero sin umbral de dano fenologico en los proximos dias.`,
      recomendacion:
        nivel === 'bajo'
          ? 'Mantener seguimiento del pronostico y del estadio fenologico; no activar defensa solo por helada meteorologica.'
          : 'Revisar el estadio real en campo, sensibilidad de yemas/brotes/flores y preparar estrategia de defensa si el lote confirma el estadio sensible.',
      fechaCritica: critico?.fecha,
      etapaFenologica: critico?.etapaFenologica,
      contextoFenologico: critico?.contextoFenologico,
      umbralDanoLeveC: critico?.umbralDanoLeveC,
      umbralDanoSeveroC: critico?.umbralDanoSeveroC,
      fuenteUmbral: critico?.fuenteUmbral,
      calibracionVarietal: critico?.calibracionVarietal,
      ajusteVarietalC: critico?.ajusteVarietalC,
      fuenteAjusteVarietal: critico?.fuenteAjusteVarietal,
      diasRiesgo: dias.filter((dia) => dia.nivel !== 'bajo').length,
      evidencia: (critico?.evidencia || []).filter(
        (item): item is string => !!item,
      ),
      serie: dias,
    };
  }

  private calcularRiesgoGranizo(
    serie: ISerieFrioTermicoDia[],
  ): IRiesgoAgroclimatico {
    const dias = serie.map((dia) => {
      const evaluacion = this.evaluarGranizoAgroclimatico(dia);
      const posibilidad = evaluacion.posibilidadPct;
      const nivel: NivelRiesgoAgroclimatico =
        posibilidad >= 65 ? 'alto' : posibilidad >= 35 ? 'medio' : 'bajo';
      return {
        fecha: dia.fecha,
        nivel,
        posibilidadPct: posibilidad,
        temperaturaMin: dia.temperaturaMin,
        temperaturaMax: dia.temperaturaMax,
        lluvia: dia.lluvia,
        probabilidadLluvia: dia.probabilidadLluvia,
        weatherCode: dia.weatherCode,
        cape: dia.cape,
        showers: dia.showers,
        rafagaViento: dia.rafagaViento,
        evidencia: evaluacion.evidencia,
        calidadDatos: evaluacion.calidadDatos,
      };
    });
    const critico = [...dias].sort(
      (a, b) => b.posibilidadPct - a.posibilidadPct,
    )[0];
    const nivel =
      critico?.posibilidadPct >= 65
        ? 'alto'
        : critico?.posibilidadPct >= 35
          ? 'medio'
          : 'bajo';
    return {
      tipo: 'granizo',
      aplica: true,
      nivel,
      posibilidadPct: critico?.posibilidadPct || 0,
      titulo: 'Riesgo estimado de granizo',
      lectura:
        nivel === 'alto'
          ? 'Ventana convectiva compatible con granizo; requiere monitoreo cercano y validacion meteorologica local.'
          : nivel === 'medio'
            ? 'Senal convectiva moderada; observar actualizaciones del pronostico y radar disponible.'
            : 'Sin senal humeda/convectiva suficiente para elevar riesgo de granizo.',
      recomendacion:
        nivel === 'bajo'
          ? 'Mantener seguimiento del pronostico local; no activar acciones por granizo sin lluvia o tormenta confirmada.'
          : 'Revisar cobertura operativa, maquinaria expuesta y recorrida posterior al evento.',
      fechaCritica: critico?.fecha,
      diasRiesgo: dias.filter((dia) => dia.nivel !== 'bajo').length,
      evidencia: critico?.evidencia || [],
      calidadDatos: critico?.calidadDatos,
      serie: dias,
    };
  }

  private reporteAgroclimatico(
    riesgo: IRiesgoAgroclimatico,
  ): Record<string, any> {
    return {
      tipo: riesgo.tipo,
      nivel: riesgo.nivel,
      posibilidadPct: riesgo.posibilidadPct,
      fechaCritica: riesgo.fechaCritica,
      etapaFenologica: riesgo.etapaFenologica,
      contextoFenologico: riesgo.contextoFenologico,
      umbralDanoLeveC: riesgo.umbralDanoLeveC,
      umbralDanoSeveroC: riesgo.umbralDanoSeveroC,
      fuenteUmbral: riesgo.fuenteUmbral,
      calibracionVarietal: riesgo.calibracionVarietal,
      ajusteVarietalC: riesgo.ajusteVarietalC,
      fuenteAjusteVarietal: riesgo.fuenteAjusteVarietal,
      diasRiesgo: riesgo.diasRiesgo,
      lectura: riesgo.lectura,
      recomendacion: riesgo.recomendacion,
      evidencia: riesgo.evidencia,
      calidadDatos: riesgo.calidadDatos,
    };
  }

  private dataNotificacion(
    tipo: string,
    riesgo: IRiesgoAgroclimatico,
    idSiembra: string,
  ): Record<string, string | number | undefined> {
    return {
      tipo,
      idSiembra,
      nivel: riesgo.nivel,
      posibilidadPct: riesgo.posibilidadPct,
      fechaCritica: riesgo.fechaCritica,
      etapaFenologica: riesgo.etapaFenologica,
      umbralDanoLeveC: riesgo.umbralDanoLeveC,
      calibracionVarietal: riesgo.calibracionVarietal,
      ajusteVarietalC: riesgo.ajusteVarietalC,
      calidadDatos: riesgo.calidadDatos?.nivel,
      calidadScore: riesgo.calidadDatos?.score,
    };
  }

  private tenant(siembra: ISiembra) {
    return {
      idDistribuidor: siembra.idDistribuidor,
      idEstablecimiento: siembra.idEstablecimiento,
      idProductor: siembra.idProductor,
      idQuimica: siembra.idQuimica,
    };
  }

  private getCentro(
    siembra: ISiembra,
  ): { lat: number; lng: number } | undefined {
    const centro = siembra.lote?.ubicacion?.centro || siembra.coordenadas;
    const lat = Number(centro?.lat);
    const lng = Number(centro?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng }
      : undefined;
  }

  private posibilidadDanoHelada(
    tempMin: number | undefined,
    umbralDanoLeve?: number,
    umbralDanoSevero?: number,
  ): number {
    if (tempMin === undefined || tempMin === null) return 0;
    if (umbralDanoLeve === undefined || umbralDanoSevero === undefined) {
      return 0;
    }
    const puntoMedio = (umbralDanoLeve + umbralDanoSevero) / 2;
    if (tempMin <= umbralDanoSevero) return 95;
    if (tempMin <= puntoMedio) return 75;
    if (tempMin <= umbralDanoLeve) return 50;
    if (tempMin <= umbralDanoLeve + 1) return 25;
    if (tempMin <= umbralDanoLeve + 2) return 10;
    return 5;
  }

  private evaluarGranizoAgroclimatico(dia: ISerieFrioTermicoDia): {
    posibilidadPct: number;
    evidencia: string[];
    calidadDatos: NonNullable<IRiesgoAgroclimatico['calidadDatos']>;
  } {
    return evaluarRiesgoGranizoAgroclimatico(dia);
  }

  private weatherCodeTormenta(code: number): boolean {
    return [95, 96, 99].includes(code);
  }

  private weatherCodeChaparron(code: number): boolean {
    return [80, 81, 82].includes(code);
  }

  private weatherCodeConvectivo(code: number): boolean {
    return this.weatherCodeTormenta(code) || this.weatherCodeChaparron(code);
  }

  private dateKey(fecha = new Date().toISOString()): string {
    const date = new Date(fecha);
    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private round(value: number, decimals = 1): number | undefined {
    if (!Number.isFinite(Number(value))) return undefined;
    const factor = Math.pow(10, decimals);
    return Math.round(Number(value) * factor) / factor;
  }

  private toFiniteNumber(value: unknown): number {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }
}
