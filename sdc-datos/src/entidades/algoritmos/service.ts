import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { IHuellaHidrica, ILote, ISiembra } from 'modelos/src';
import {
  calcularHuellaHidrica,
  calcularSeguimientoHuellaHidrica,
  DiaClimaHuella,
  getHuellaHidricaConstantes,
  HuellaHidricaParams,
  HuellaHidricaResultado,
  HuellaHidricaSeguimientoResultado,
} from './huella-hidrica.engine';

export interface AlgoritmoCatalogo {
  id: string;
  nombre: string;
  estado: 'operativo' | 'auditable' | 'configurable';
  descripcion: string;
  inputs: string[];
  outputs: string[];
}

@Injectable()
export class AlgoritmosService {
  private readonly logger = new Logger(AlgoritmosService.name);

  getCatalogo(): AlgoritmoCatalogo[] {
    return [
      {
        id: 'huella-hidrica',
        nombre: 'Huella hidrica',
        estado: 'operativo',
        descripcion:
          'Calcula huella verde, azul, gris y total al cosechar. Usa ETc/Kc, lluvia efectiva, fertilizaciones y fumigaciones.',
        inputs: [
          'Siembra: cultivo, fecha de siembra/cosecha, rendimiento seco, labranza, dosis N/P y manejo',
          'Lote: suelo, drenaje, pendiente, deposito N y contenido P',
          'Clima diario: precipitacion y ET0',
          'Fertilizaciones: dosis y composicion N/P',
          'Fumigaciones: principio activo, concentracion y dosis',
        ],
        outputs: ['litros/kg verde', 'litros/kg azul', 'litros/kg gris', 'litros/kg total', 'traza de calculo'],
      },
      {
        id: 'enfermedades',
        nombre: 'Prediccion de enfermedades',
        estado: 'auditable',
        descripcion:
          'Cruza susceptibilidad varietal, etapa fenologica, humedad persistente, lluvia y temperatura por cultivo.',
        inputs: ['Cultivo y variedad', 'Fenologia', 'Humedad relativa', 'Lluvia', 'Temperatura'],
        outputs: ['riesgo por enfermedad', 'periodo critico', 'prescripcion orientativa'],
      },
      {
        id: 'riego',
        nombre: 'Recomendacion de riego',
        estado: 'auditable',
        descripcion:
          'Combina humedad de suelo, capacidad de campo, punto de marchitez, ET0 y balance hidrico para recomendar riego.',
        inputs: ['Sensor de suelo', 'Suelo', 'ET0', 'Pronostico', 'Cultivo'],
        outputs: ['agua util', 'deficit', 'recomendacion'],
      },
      {
        id: 'malezas',
        nombre: 'Prediccion de malezas',
        estado: 'auditable',
        descripcion:
          'Evalua emergencia de malezas para trigo, soja y maiz usando acumulacion termica/hidrica y parametros Gompertz.',
        inputs: ['Cultivo', 'Temperatura', 'Humedad/lluvia', 'Parametros por especie'],
        outputs: ['probabilidad de emergencia', 'ventana de control', 'curva estimada'],
      },
    ];
  }

  getParametrosHuellaHidrica() {
    return getHuellaHidricaConstantes();
  }

  simularHuellaHidrica(params: HuellaHidricaParams): HuellaHidricaResultado {
    return calcularHuellaHidrica(params);
  }

  simularEnfermedades(body: any) {
    const cultivo = body?.cultivo || 'Trigo';
    const variedad = body?.variedad || 'Variedad sensible';
    const etapa = body?.etapa || 'Hoja bandera';
    const humedad = Number(body?.humedadRelativa ?? 88);
    const horasMojado = Number(body?.horasMojado ?? 18);
    const lluvia48 = Number(body?.lluvia48h ?? 12);
    const temperatura = Number(body?.temperatura ?? 18);
    const susceptibilidad = Number(body?.susceptibilidad ?? 0.7);

    const enfermedades = this.getEnfermedadesCultivo(cultivo).map((enfermedad) => {
      const etapaActiva = enfermedad.etapas.some((item) => item.toLowerCase() === String(etapa).toLowerCase());
      const humedadScore = this.clamp((humedad - enfermedad.humedadBase) / 18, 0, 1);
      const mojadoScore = this.clamp(horasMojado / enfermedad.horasMojadoCriticas, 0, 1);
      const lluviaScore = this.clamp(lluvia48 / enfermedad.lluviaCritica, 0, 1);
      const tempScore = this.clamp(1 - Math.abs(temperatura - enfermedad.tempOptima) / 14, 0, 1);
      const etapaScore = etapaActiva ? 1 : 0.42;
      const riesgo = this.round(
        100 *
          (0.25 * humedadScore +
            0.22 * mojadoScore +
            0.16 * lluviaScore +
            0.17 * tempScore +
            0.12 * susceptibilidad +
            0.08 * etapaScore),
        1,
      );

      return {
        nombre: enfermedad.nombre,
        periodo: enfermedad.periodo,
        riesgo,
        nivel: this.nivelRiesgo(riesgo),
        prescripcion: enfermedad.prescripcion,
        etapaActiva,
      };
    });

    const maxRiesgo = Math.max(...enfermedades.map((item) => item.riesgo), 0);
    const serie = Array.from({ length: 10 }).map((_, index) => {
      const humedadDia = humedad + Math.sin(index / 1.5) * 5;
      const mojadoDia = Math.max(0, horasMojado - 6 + index * 1.2);
      const riesgo = this.clamp(maxRiesgo * 0.55 + humedadDia * 0.18 + mojadoDia * 1.2 - index * 1.4, 0, 100);
      return { label: `Dia ${index + 1}`, value: this.round(riesgo, 1) };
    });

    return {
      motor: 'enfermedades',
      resumen: `${cultivo} ${variedad}: ${this.nivelRiesgo(maxRiesgo)} (${this.round(maxRiesgo, 1)}%)`,
      metricas: {
        cultivo,
        variedad,
        etapa,
        humedadRelativa: humedad,
        horasMojado,
        lluvia48h: lluvia48,
        temperatura,
      },
      enfermedades,
      serie,
      trazas: [
        'Riesgo = humedad persistente + horas de mojado + lluvia + temperatura + susceptibilidad varietal + ventana fenologica.',
        `Etapa evaluada: ${etapa}. Humedad ${humedad}%, mojado ${horasMojado} h, lluvia 48 h ${lluvia48} mm.`,
      ],
    };
  }

  simularRiego(body: any) {
    const humedadActual = Number(body?.humedadSueloPct ?? 24);
    const capacidadCampo = Number(body?.capacidadCampoPct ?? 32);
    const puntoMarchitez = Number(body?.puntoMarchitezPct ?? 14);
    const profundidadCm = Number(body?.profundidadRaicesCm ?? 60);
    const et0 = Number(body?.et0MmDia ?? 4.2);
    const kc = Number(body?.kc ?? 0.9);
    const lluvia72h = Number(body?.lluvia72h ?? 4);
    const umbralAguaUtil = Number(body?.umbralAguaUtilPct ?? 45);

    const rangoUtil = Math.max(capacidadCampo - puntoMarchitez, 1);
    const aguaUtilPct = this.clamp(((humedadActual - puntoMarchitez) / rangoUtil) * 100, 0, 100);
    const deficitMm = this.clamp(((capacidadCampo - humedadActual) / 100) * profundidadCm * 10, 0, 300);
    const etcDia = et0 * kc;
    const demanda72h = etcDia * 3;
    const balance72h = lluvia72h - demanda72h;
    const recomendacionMm = aguaUtilPct < umbralAguaUtil ? this.round(Math.max(deficitMm - lluvia72h * 0.8, 0), 1) : 0;
    const decision = recomendacionMm > 0 ? `Regar ${recomendacionMm} mm` : 'No regar por ahora';
    let humedad = humedadActual;
    const serie = Array.from({ length: 7 }).map((_, index) => {
      const lluviaDia = index < 3 ? lluvia72h / 3 : 0;
      humedad = this.clamp(humedad + lluviaDia / (profundidadCm * 10) * 100 - etcDia / (profundidadCm * 10) * 100, puntoMarchitez, capacidadCampo);
      const aguaUtil = this.clamp(((humedad - puntoMarchitez) / rangoUtil) * 100, 0, 100);
      return { label: `Dia ${index + 1}`, value: this.round(aguaUtil, 1) };
    });

    return {
      motor: 'riego',
      resumen: decision,
      metricas: {
        humedadActual,
        capacidadCampo,
        puntoMarchitez,
        aguaUtilPct: this.round(aguaUtilPct, 1),
        deficitMm: this.round(deficitMm, 1),
        etcDia: this.round(etcDia, 1),
        balance72h: this.round(balance72h, 1),
        recomendacionMm,
      },
      serie,
      trazas: [
        'Agua util = (humedad actual - punto marchitez) / (capacidad campo - punto marchitez).',
        'Deficit mm = diferencia a capacidad de campo por profundidad efectiva de raices.',
        `ETc diaria = ET0 ${et0} x Kc ${kc} = ${this.round(etcDia, 1)} mm/dia.`,
      ],
    };
  }

  simularMalezas(body: any) {
    const cultivo = body?.cultivo || 'Trigo';
    const especie = body?.especie || 'Amaranthus';
    const dias = Number(body?.dias ?? 20);
    const temperaturaMedia = Number(body?.temperaturaMedia ?? 17);
    const baseTermica = Number(body?.baseTermica ?? 8);
    const humedadSuelo = Number(body?.humedadSueloPct ?? 55);
    const lluvia7d = Number(body?.lluvia7d ?? 18);
    const k = Number(body?.k ?? 0.038);
    const x0 = Number(body?.x0 ?? 130);
    const amplitud = Number(body?.amplitud ?? 92);

    const cultivosPermitidos = ['Trigo', 'Soja', 'Maiz'];
    const habilitado = cultivosPermitidos.includes(cultivo);
    let gradosDia = 0;
    const humedadFactor = this.clamp((humedadSuelo + lluvia7d) / 100, 0.25, 1.25);
    const serie = Array.from({ length: dias }).map((_, index) => {
      gradosDia += Math.max(temperaturaMedia - baseTermica, 0) * humedadFactor;
      const emergencia = habilitado ? amplitud * Math.exp(-Math.exp(-k * (gradosDia - x0))) : 0;
      return { label: `Dia ${index + 1}`, value: this.round(this.clamp(emergencia, 0, 100), 1) };
    });
    const ultimo = serie[serie.length - 1]?.value || 0;

    return {
      motor: 'malezas',
      resumen: habilitado
        ? `${especie}: emergencia acumulada ${this.round(ultimo, 1)}%`
        : `No aplica para ${cultivo}; malezas solo se habilita en trigo, soja y maiz.`,
      metricas: {
        cultivo,
        especie,
        gradosDia: this.round(gradosDia, 1),
        temperaturaMedia,
        humedadSuelo,
        lluvia7d,
        habilitado,
      },
      serie,
      trazas: [
        'Curva Gompertz: emergencia = A x exp(-exp(-k x (grados dia - x0))).',
        'Los grados dia se ajustan por humedad de suelo y lluvia reciente.',
        habilitado ? 'Motor habilitado para trigo, soja y maiz.' : `Cultivo ${cultivo} fuera del alcance operativo del motor de malezas.`,
      ],
    };
  }

  async calcularHuellaHidricaReal(params: Omit<HuellaHidricaParams, 'clima'>): Promise<HuellaHidricaResultado> {
    const lote = params.lote;
    const siembra = params.siembra;
    const lat = lote.ubicacion?.centro?.lat;
    const lng = lote.ubicacion?.centro?.lng;
    if (lat == null || lng == null) {
      throw new BadRequestException('No se puede calcular huella hidrica: el lote no tiene centro geografico.');
    }
    if (!siembra.fechaSiembra || !siembra.fechaCosecha) {
      throw new BadRequestException('No se puede calcular huella hidrica: faltan fechas de siembra o cosecha.');
    }
    const clima = await this.getClimaOpenMeteo(lat, lng, siembra.fechaSiembra, siembra.fechaCosecha);
    return calcularHuellaHidrica({ ...params, clima });
  }

  async calcularSeguimientoHuellaHidrica(
    params: Omit<HuellaHidricaParams, 'clima'>,
  ): Promise<HuellaHidricaSeguimientoResultado> {
    const lote = params.lote;
    const siembra = params.siembra;
    const lat = lote.ubicacion?.centro?.lat;
    const lng = lote.ubicacion?.centro?.lng;
    if (lat == null || lng == null) {
      return calcularSeguimientoHuellaHidrica({ ...params, clima: [] });
    }
    if (!siembra.fechaSiembra) {
      return calcularSeguimientoHuellaHidrica({ ...params, clima: [] });
    }

    const desde = this.toDateKey(siembra.fechaSiembra);
    const hoy = this.toDateKey(new Date().toISOString());
    const hasta = siembra.fechaCosecha ? this.toDateKey(siembra.fechaCosecha) : hoy;
    const fechaHasta = desde > hasta ? desde : hasta;
    const clima = await this.getClimaOpenMeteo(lat, lng, desde, fechaHasta);
    return calcularSeguimientoHuellaHidrica({ ...params, clima });
  }

  calcularHumedadSeca(rendimientoKgHa?: number, humedadCosecha?: number): number {
    const rendimiento = Number(rendimientoKgHa || 0);
    const humedad = Number(humedadCosecha || 0);
    if (rendimiento <= 0) return 0;
    return Math.round(rendimiento * (100 / (100 + humedad)) * 100) / 100;
  }

  private getEnfermedadesCultivo(cultivo: string) {
    const base: Record<string, Array<Record<string, any>>> = {
      Trigo: [
        {
          nombre: 'Mancha Amarilla',
          periodo: 'Emergencia a hoja bandera',
          etapas: ['Emergencia', 'Macollaje', 'Hoja bandera'],
          humedadBase: 82,
          horasMojadoCriticas: 16,
          lluviaCritica: 10,
          tempOptima: 20,
          prescripcion: 'Triazol + estrobilurina; proteger area foliar y hoja bandera.',
        },
        {
          nombre: 'Roya de la Hoja',
          periodo: 'Hoja bandera a llenado de granos',
          etapas: ['Hoja bandera', 'Espigazon', 'Antesis', 'Llenado de granos'],
          humedadBase: 78,
          horasMojadoCriticas: 10,
          lluviaCritica: 6,
          tempOptima: 18,
          prescripcion: 'Triazol o mezcla doble; priorizar cuando sube HR y temperatura templada.',
        },
        {
          nombre: 'Fusarium de la Espiga',
          periodo: 'Espigazon y antesis',
          etapas: ['Espigazon', 'Antesis'],
          humedadBase: 86,
          horasMojadoCriticas: 24,
          lluviaCritica: 15,
          tempOptima: 22,
          prescripcion: 'Metconazole/Prothioconazole/Tebuconazole en ventana de espiga.',
        },
      ],
      Soja: [
        {
          nombre: 'Mancha Marron',
          periodo: 'Vegetativo a reproductivo temprano',
          etapas: ['Vegetativo', 'R1', 'R3'],
          humedadBase: 84,
          horasMojadoCriticas: 14,
          lluviaCritica: 12,
          tempOptima: 24,
          prescripcion: 'Triazol + estrobilurina segun umbral y ambiente predisponente.',
        },
      ],
      Maiz: [
        {
          nombre: 'Tizon foliar',
          periodo: 'V8 a R2',
          etapas: ['V8', 'VT', 'R1', 'R2'],
          humedadBase: 85,
          horasMojadoCriticas: 14,
          lluviaCritica: 10,
          tempOptima: 23,
          prescripcion: 'Fungicida foliar en hibridos susceptibles y ambiente de alto riesgo.',
        },
      ],
    };

    return base[cultivo] || base.Trigo;
  }

  private nivelRiesgo(riesgo: number): string {
    if (riesgo >= 70) return 'riesgo alto';
    if (riesgo >= 45) return 'riesgo medio';
    return 'riesgo bajo';
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private round(value: number, digits = 2): number {
    if (!Number.isFinite(value)) return 0;
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
  }

  private async getClimaOpenMeteo(
    lat: number,
    lng: number,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<DiaClimaHuella[]> {
    const desde = this.toDateKey(fechaDesde);
    const hasta = this.toDateKey(fechaHasta);
    if (desde > hasta) {
      throw new BadRequestException('La fecha de cosecha no puede ser anterior a la fecha de siembra.');
    }

    const hoy = this.toDateKey(new Date().toISOString());
    const ayer = this.shiftDateKey(hoy, -1);
    const resultados: DiaClimaHuella[] = [];

    if (desde <= ayer) {
      const end = hasta < ayer ? hasta : ayer;
      resultados.push(...(await this.fetchOpenMeteo('archive', lat, lng, desde, end)));
    }
    if (hasta >= hoy) {
      const start = desde > hoy ? desde : hoy;
      resultados.push(...(await this.fetchOpenMeteo('forecast', lat, lng, start, hasta)));
    }

    return resultados.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  private async fetchOpenMeteo(
    tipo: 'archive' | 'forecast',
    lat: number,
    lng: number,
    desde: string,
    hasta: string,
  ): Promise<DiaClimaHuella[]> {
    if (desde > hasta) return [];
    const base =
      tipo === 'archive'
        ? 'https://archive-api.open-meteo.com/v1/archive'
        : 'https://api.open-meteo.com/v1/forecast';
    const url = new URL(base);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('start_date', desde);
    url.searchParams.set('end_date', hasta);
    url.searchParams.set('daily', 'precipitation_sum,et0_fao_evapotranspiration');
    url.searchParams.set('timezone', 'America/Argentina/Buenos_Aires');

    try {
      const { data } = await axios.get(url.toString(), { timeout: 15000 });
      const fechas: string[] = data?.daily?.time || [];
      const lluvias: number[] = data?.daily?.precipitation_sum || [];
      const et0: number[] = data?.daily?.et0_fao_evapotranspiration || [];
      return fechas.map((fecha, index) => ({
        fecha,
        lluviaMm: Number(lluvias[index] || 0),
        et0Mm: Number(et0[index] || 0),
      }));
    } catch (error) {
      this.logger.error(`Error Open-Meteo ${tipo} ${desde}/${hasta}: ${error}`);
      throw new BadRequestException('No se pudo obtener clima Open-Meteo para calcular la huella hidrica.');
    }
  }

  private toDateKey(fecha: string): string {
    return new Date(fecha).toISOString().slice(0, 10);
  }

  private shiftDateKey(fecha: string, dias: number): string {
    const date = new Date(`${fecha}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + dias);
    return date.toISOString().slice(0, 10);
  }
}
