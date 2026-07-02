import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  IDispositivo,
  IHuellaHidrica,
  ILote,
  IMaleza,
  IPrediccionMalezaDia,
  IPrediccionMalezaEspecie,
  IPrediccionMalezaUmbral,
  IResultadoPrediccionMalezas,
  ISiembra,
  TCalidadPrediccionMalezas,
  TSeveridadPrediccionMaleza,
} from 'modelos/src';
import { MalezasService } from '../maleza/service';
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

interface DiaClimaMalezas {
  fecha: string;
  tipo: 'historico' | 'pronostico';
  temperaturaMedia?: number;
  lluviaMm?: number;
  et0Mm?: number;
}

interface SensorSueloReferencia {
  temperatura?: number;
  humedad?: number;
}

@Injectable()
export class AlgoritmosService {
  private readonly logger = new Logger(AlgoritmosService.name);
  private readonly cultivosMalezas = ['Trigo', 'Soja', 'Maiz'];
  private readonly diasPronosticoMalezas = 7;
  private readonly maxDiasHistoricoMalezas = 180;

  constructor(private readonly malezasService: MalezasService) {}

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
          'Cruza susceptibilidad varietal, etapa fenologica, zona/ciclo, humedad persistente, lluvia y temperatura por cultivo.',
        inputs: ['Cultivo y variedad', 'Fenologia', 'Zona/ciclo', 'Humedad relativa', 'Lluvia', 'Temperatura'],
        outputs: ['riesgo por enfermedad', 'periodo critico', 'prescripcion orientativa'],
      },
      {
        id: 'riego',
        nombre: 'Recomendacion de riego',
        estado: 'auditable',
        descripcion:
          'Motor V12: requiere lanza/sonda de humedad, cruza dia/noche, raices, capacidad de campo, PMP, ET0, Kc y lluvia efectiva.',
        inputs: [
          'Lanza de humedad de suelo por profundidad',
          'Capacidad de campo estimada o cargada',
          'Punto de marchitez permanente',
          'Raices activas por nivel',
          'ET0, Kc, lluvia y probabilidad de lluvia',
          'Capacidad diaria de riego, bulbo y metros lineales por hectarea',
        ],
        outputs: ['agua util mm/%', 'deficit mm', 'demanda 72 h', 'lluvia efectiva', 'recomendacion mm', 'traza auditable'],
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
    const zona = body?.zona || body?.departamento || 'Zona sin definir';
    const humedad = Number(body?.humedadRelativa ?? 88);
    const horasMojado = Number(body?.horasMojado ?? 18);
    const lluvia48 = Number(body?.lluvia48h ?? 12);
    const temperatura = Number(body?.temperatura ?? 18);
    const susceptibilidad = Number(body?.susceptibilidad ?? 0.7);
    const resistenciasVarietales = Array.isArray(body?.resistencia)
      ? body.resistencia
      : Array.isArray(body?.resistencias)
        ? body.resistencias
        : [];

    const enfermedades = this.getEnfermedadesCultivo(cultivo).map((enfermedad) => {
      const etapaActiva = enfermedad.etapas.some((item) => item.toLowerCase() === String(etapa).toLowerCase());
      const humedadScore = this.clamp((humedad - enfermedad.humedadBase) / 18, 0, 1);
      const mojadoScore = this.clamp(horasMojado / enfermedad.horasMojadoCriticas, 0, 1);
      const lluviaScore = this.clamp(lluvia48 / enfermedad.lluviaCritica, 0, 1);
      const tempScore = this.clamp(1 - Math.abs(temperatura - enfermedad.tempOptima) / 14, 0, 1);
      const etapaScore = etapaActiva ? 1 : 0.42;
      const susceptibilidadEnfermedad = this.getSusceptibilidadVarietal(
        enfermedad.nombre,
        susceptibilidad,
        resistenciasVarietales,
      );
      const riesgo = this.round(
        100 *
          (0.25 * humedadScore +
            0.22 * mojadoScore +
            0.16 * lluviaScore +
            0.17 * tempScore +
            0.12 * susceptibilidadEnfermedad +
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
        susceptibilidad: this.round(susceptibilidadEnfermedad, 2),
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
        zona,
        humedadRelativa: humedad,
        horasMojado,
        lluvia48h: lluvia48,
        temperatura,
        fuenteVarietal: resistenciasVarietales.length ? 'semilla.resistencia' : 'sensibilidad base manual',
      },
      enfermedades,
      serie,
      trazas: [
        'Riesgo = humedad persistente + horas de mojado + lluvia + temperatura + susceptibilidad varietal + ventana fenologica.',
        `Etapa evaluada: ${etapa}. Humedad ${humedad}%, mojado ${horasMojado} h, lluvia 48 h ${lluvia48} mm.`,
        `Zona evaluada: ${zona}. En produccion el crono se resuelve por departamento, ciclo y fecha de siembra.`,
        resistenciasVarietales.length
          ? `Susceptibilidad por enfermedad tomada de semilla.resistencia (${resistenciasVarietales.length} registro(s)).`
          : 'Sin resistencia varietal especifica: se uso susceptibilidad base manual para todas las enfermedades.',
      ],
    };
  }

  simularRiego(body: any) {
    const humedadActual = Number(body?.humedadSueloPct ?? 31);
    const capacidadCampo = Number(body?.capacidadCampoPct ?? 34);
    const puntoMarchitez = Number(body?.puntoMarchitezPct ?? 14);
    const profundidadCm = Number(body?.profundidadRaicesCm ?? 60);
    const et0 = Number(body?.et0MmDia ?? 4.2);
    const kc = Number(body?.kc ?? 0.9);
    const lluvia72h = Number(body?.lluvia72h ?? 4);
    const probabilidadLluvia = Number(body?.probabilidadLluviaPct ?? 55);
    const capacidadRiegoDia = Number(body?.capacidadRiegoMmDia ?? 6);
    const anchoBulboM = Number(body?.anchoBulboM ?? 1);
    const metrosLinealesHa = Number(body?.metrosLinealesHa ?? 10000);
    const umbralAguaUtil = Number(body?.umbralAguaUtilPct ?? 45);
    const raicesActivas = body?.raicesActivas !== false;

    const factorAreaMojada = this.clamp((anchoBulboM * metrosLinealesHa) / 10000, 0.05, 1.5);
    const rangoUtilPct = Math.max(capacidadCampo - puntoMarchitez, 1);
    const aguaTotalDisponibleMm = (rangoUtilPct / 100) * profundidadCm * 10 * factorAreaMojada;
    const aguaUtilActualMm =
      (this.clamp(humedadActual - puntoMarchitez, 0, rangoUtilPct) / 100) *
      profundidadCm *
      10 *
      factorAreaMojada;
    const aguaUtilPct = this.clamp((aguaUtilActualMm / Math.max(aguaTotalDisponibleMm, 1)) * 100, 0, 100);
    const deficitMm =
      (this.clamp(capacidadCampo - humedadActual, 0, capacidadCampo) / 100) *
      profundidadCm *
      10 *
      factorAreaMojada;
    const etcDia = et0 * kc;
    const demanda72h = etcDia * 3;
    const lluviaEfectiva72h = probabilidadLluvia >= 70 ? lluvia72h * 0.8 : 0;
    const saldo72h = aguaUtilActualMm + lluviaEfectiva72h - demanda72h;
    const umbralMm = (aguaTotalDisponibleMm * umbralAguaUtil) / 100;
    const recomendacionMm =
      raicesActivas && saldo72h < umbralMm
        ? this.round(Math.min(Math.max(deficitMm - lluviaEfectiva72h, 0), capacidadRiegoDia), 1)
        : 0;
    const decision = !raicesActivas
      ? 'No recomendar: falta confirmar raíces activas en la zona medida'
      : recomendacionMm > 0
        ? `Regar ${recomendacionMm} mm`
        : 'No regar por ahora';
    let humedad = humedadActual;
    const serie = Array.from({ length: 7 }).map((_, index) => {
      const lluviaDia = index < 3 ? lluviaEfectiva72h / 3 : 0;
      humedad = this.clamp(humedad + lluviaDia / (profundidadCm * 10) * 100 - etcDia / (profundidadCm * 10) * 100, puntoMarchitez, capacidadCampo);
      const aguaUtil = this.clamp(((humedad - puntoMarchitez) / rangoUtilPct) * 100, 0, 100);
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
        aguaUtilActualMm: this.round(aguaUtilActualMm, 1),
        aguaTotalDisponibleMm: this.round(aguaTotalDisponibleMm, 1),
        deficitMm: this.round(deficitMm, 1),
        etcDia: this.round(etcDia, 1),
        demanda72h: this.round(demanda72h, 1),
        lluviaEfectiva72h: this.round(lluviaEfectiva72h, 1),
        balance72h: this.round(saldo72h, 1),
        recomendacionMm,
        capacidadRiegoDia,
        raicesActivas,
      },
      serie,
      trazas: [
        'Agua util = (humedad actual - PMP) / (capacidad de campo - PMP).',
        'Deficit mm = diferencia a capacidad de campo por profundidad efectiva, bulbo mojado y metros lineales por hectarea.',
        `ETc diaria = ET0 ${et0} x Kc ${kc} = ${this.round(etcDia, 1)} mm/dia.`,
        `Lluvia efectiva 72 h = ${probabilidadLluvia >= 70 ? 'lluvia x 0.8' : '0 por baja probabilidad'} = ${this.round(lluviaEfectiva72h, 1)} mm.`,
        'La recomendacion se limita por capacidad diaria de riego y exige raices activas detectadas/cargadas.',
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

  async calcularPrediccionMalezas(params: { siembra: ISiembra; lote: ILote }): Promise<IResultadoPrediccionMalezas> {
    const siembra = params.siembra;
    const lote = params.lote;
    const cultivo = siembra.semilla?.cultivo;
    const fecha = new Date().toISOString();
    const baseResultado: IResultadoPrediccionMalezas = {
      fecha,
      idSiembra: siembra._id,
      idLote: lote._id || siembra.idLote,
      cultivo,
      estado: 'operativo',
      fuenteDatos: 'Open-Meteo',
      calidadDatos: 'media',
      especies: [],
      trazas: [],
    };

    if (!cultivo || !this.cultivosMalezas.includes(cultivo)) {
      return {
        ...baseResultado,
        estado: 'no_aplica',
        resumen: `Motor de malezas habilitado para ${this.cultivosMalezas.join(', ')}.`,
        calidadDatos: 'baja',
        trazas: [`Cultivo recibido: ${cultivo || 'sin cultivo'}.`],
      };
    }

    const modelos = await this.getModelosMalezas(cultivo);
    if (!modelos.length) {
      return {
        ...baseResultado,
        estado: 'sin_modelos',
        resumen: `${cultivo}: no hay modelos de malezas cargados.`,
        calidadDatos: 'baja',
        trazas: ['No se encontraron documentos en la coleccion malezas para el cultivo.'],
      };
    }

    const centro = this.getCentroLote(lote, siembra);
    if (!centro) {
      return {
        ...baseResultado,
        estado: 'sin_clima',
        resumen: `${cultivo}: falta centro geografico del lote para consultar clima.`,
        calidadDatos: 'baja',
        trazas: ['No se pudo resolver lat/lng desde lote.ubicacion.centro ni siembra.coordenadas.'],
      };
    }

    const hoy = this.toDateKey(new Date().toISOString());
    const ayer = this.shiftDateKey(hoy, -1);
    const hastaPronostico = this.shiftDateKey(hoy, this.diasPronosticoMalezas - 1);
    const fechaSiembra = this.toDateKey(siembra.fechaSiembra || hoy);
    const desdeMaximo = this.shiftDateKey(hoy, -this.maxDiasHistoricoMalezas);
    const desde = fechaSiembra > desdeMaximo ? fechaSiembra : desdeMaximo;
    const recorteDias = fechaSiembra < desde ? this.diffDias(fechaSiembra, desde) : 0;

    let clima: DiaClimaMalezas[] = [];
    try {
      clima = await this.getClimaMalezasOpenMeteo(centro.lat, centro.lng, desde, hastaPronostico);
    } catch (error) {
      this.logger.error(`Error al calcular malezas ${siembra._id}: ${error}`);
      return {
        ...baseResultado,
        estado: 'sin_clima',
        resumen: `${cultivo}: no se pudo obtener clima historico/proyectado.`,
        calidadDatos: 'baja',
        trazas: ['Open-Meteo no respondio para la ventana de malezas. No se actualizo la prediccion persistida.'],
      };
    }

    if (!clima.length) {
      return {
        ...baseResultado,
        estado: 'sin_clima',
        resumen: `${cultivo}: sin dias climaticos disponibles para evaluar malezas.`,
        calidadDatos: 'baja',
        periodo: {
          desde,
          hastaHistorico: ayer,
          hastaPronostico,
          diasHistorico: 0,
          diasPronostico: 0,
          diasEvaluados: 0,
          recorteDias,
        },
        trazas: ['La consulta climatica no devolvio dias utiles.'],
      };
    }

    const sensor = this.getSensorSueloReferencia(lote);
    const especies = modelos.map((maleza) => this.evaluarMaleza(maleza, clima, sensor));
    const mayor = [...especies].sort((a, b) => Number(b.avancePct || 0) - Number(a.avancePct || 0))[0];
    const diasHistorico = clima.filter((dia) => dia.tipo === 'historico').length;
    const diasPronostico = clima.filter((dia) => dia.tipo === 'pronostico').length;
    const calidadDatos = this.calidadPrediccionMalezas(sensor, diasHistorico, diasPronostico);

    return {
      ...baseResultado,
      resumen: mayor
        ? `${cultivo}: mayor avance en ${mayor.nombre || 'maleza'} (${this.round(mayor.avancePct || 0, 1)}%).`
        : `${cultivo}: sin especies evaluadas.`,
      fuenteDatos:
        sensor.temperatura !== undefined || sensor.humedad !== undefined
          ? 'Open-Meteo + sensor de suelo'
          : 'Open-Meteo historico/proyectado',
      calidadDatos,
      periodo: {
        desde,
        hastaHistorico: ayer,
        hastaPronostico,
        diasHistorico,
        diasPronostico,
        diasEvaluados: clima.length,
        recorteDias,
      },
      especies,
      trazas: [
        'HTT diario = max(0, temperatura media - base termica) x factor hidrico x delta horas.',
        'Factor hidrico = 1 / (1 + exp((theta50 - humedad) / escala)).',
        'Emergencia Gompertz = K x exp(-exp(-beta x (HTT acumulado - mu))).',
        recorteDias > 0
          ? `La siembra excedia la ventana operativa; se recortaron ${recorteDias} dias iniciales y se evaluo desde ${desde}.`
          : `Acumulacion desde fecha de siembra: ${desde}.`,
      ],
    };
  }

  calcularHumedadSeca(rendimientoKgHa?: number, humedadCosecha?: number): number {
    const rendimiento = Number(rendimientoKgHa || 0);
    const humedad = Number(humedadCosecha || 0);
    if (rendimiento <= 0) return 0;
    return Math.round(rendimiento * (100 / (100 + humedad)) * 100) / 100;
  }

  private async getModelosMalezas(cultivo: string): Promise<IMaleza[]> {
    const response = await this.malezasService.getFilter({
      filter: JSON.stringify({ cultivosObjetivo: cultivo }),
      sort: 'nombre',
    });
    return response.datos || [];
  }

  private evaluarMaleza(
    maleza: IMaleza,
    clima: DiaClimaMalezas[],
    sensor: SensorSueloReferencia,
  ): IPrediccionMalezaEspecie {
    const parametros = maleza.parametros || {};
    const base = Number(parametros.temperaturaBase ?? 0);
    const deltaHoras = Number(parametros.deltaHoras ?? 24);
    const theta50 = Number(parametros.humedadTheta50 ?? 0.2);
    const escala = Number(parametros.humedadEscala ?? 0.03);
    const k = Number(parametros.kMaxPorcentaje ?? 100);
    const beta = Number(parametros.beta ?? 0);
    const mu = Number(parametros.muHorasTermicas ?? 0);
    let httAcumulado = 0;
    let httHistorico = 0;
    let httProyectado7d = 0;

    const serie: IPrediccionMalezaDia[] = clima.map((dia) => {
      const usarSensor = dia.tipo === 'pronostico';
      const temperatura = usarSensor && sensor.temperatura !== undefined
        ? sensor.temperatura
        : this.toNumber(dia.temperaturaMedia) ?? 0;
      const humedad = usarSensor && sensor.humedad !== undefined
        ? sensor.humedad
        : this.humedadProxyMalezas(dia);
      const factorTermico = Math.max(0, temperatura - base);
      const factorHidrico = 1 / (1 + Math.exp((theta50 - humedad) / escala));
      const httDia = factorTermico * factorHidrico * deltaHoras;
      httAcumulado += httDia;

      if (dia.tipo === 'historico') {
        httHistorico += httDia;
      } else {
        httProyectado7d += httDia;
      }

      return {
        fecha: dia.fecha,
        tipo: dia.tipo,
        temperaturaMedia: this.round(temperatura, 1),
        lluviaMm: this.round(dia.lluviaMm || 0, 1),
        et0Mm: this.round(dia.et0Mm || 0, 1),
        humedadSueloPct: this.round(humedad * 100, 0),
        factorHidrico: this.round(factorHidrico, 3),
        httDia: this.round(httDia, 1),
        httAcumulado: this.round(httAcumulado, 1),
        emergenciaPct: this.gompertz(httAcumulado, k, beta, mu),
        fuente: usarSensor && (sensor.temperatura !== undefined || sensor.humedad !== undefined)
          ? 'Open-Meteo + sensor'
          : 'Open-Meteo',
      };
    });

    const emergenciaActualPct = this.gompertz(httHistorico, k, beta, mu);
    const emergenciaProyectada7dPct = this.gompertz(httAcumulado, k, beta, mu);
    const umbrales = this.analizarUmbralesMaleza(maleza, serie, httAcumulado);
    const progresoE10 = umbrales[0]?.progreso || 0;
    const avancePct = this.porcentaje(Math.max(emergenciaProyectada7dPct, progresoE10));
    const severidad = this.severidadMalezas(avancePct, emergenciaProyectada7dPct);
    const calidadDatos = this.calidadPrediccionMalezas(
      sensor,
      clima.filter((dia) => dia.tipo === 'historico').length,
      clima.filter((dia) => dia.tipo === 'pronostico').length,
    );

    return {
      idMaleza: String(maleza._id || ''),
      codigoCarga: maleza.codigoCarga,
      nombre: maleza.nombre,
      nombreCientifico: maleza.nombreCientifico,
      modelo: maleza.modelo || 'Gompertz HTT',
      avancePct,
      emergenciaPct: emergenciaProyectada7dPct,
      emergenciaActualPct,
      emergenciaProyectada7dPct,
      httHistorico: this.round(httHistorico, 1),
      httProyectado7d: this.round(httProyectado7d, 1),
      httTotal: this.round(httAcumulado, 1),
      temperaturaReferencia: sensor.temperatura,
      humedadReferencia: sensor.humedad,
      severidad,
      estado: severidad === 'alta' ? 'Ventana de control' : severidad === 'media' ? 'Monitoreo cercano' : 'Baja emergencia',
      estadoCorto: severidad === 'alta' ? 'Avance alto' : severidad === 'media' ? 'Avance medio' : 'Avance bajo',
      lecturaCorta: this.lecturaCortaMalezas(severidad, emergenciaActualPct, emergenciaProyectada7dPct, progresoE10),
      recomendacion: this.recomendacionMaleza(severidad, maleza),
      fuenteDatos: sensor.temperatura !== undefined || sensor.humedad !== undefined
        ? 'Open-Meteo + sensor de suelo'
        : 'Open-Meteo historico/proyectado',
      detalleFuente: this.detalleFuenteMalezas(sensor, clima.length),
      formula: `Emergencia = K x exp(-exp(-beta x (HTT - mu))). K=${k || '-'}, beta=${beta || '-'}, mu=${mu || '-'} HTT.`,
      calidadDatos,
      temperaturaBase: base,
      deltaHoras,
      umbrales,
      recomendaciones: maleza.recomendaciones || [],
      observaciones: maleza.observaciones,
      serie,
    };
  }

  private analizarUmbralesMaleza(
    maleza: IMaleza,
    serie: IPrediccionMalezaDia[],
    httTotal: number,
  ): IPrediccionMalezaUmbral[] {
    return [...(maleza.umbrales || [])]
      .sort((a, b) => Number(a.porcentaje || 0) - Number(b.porcentaje || 0))
      .map((umbral) => {
        const horasTermicas = Number(umbral.horasTermicas || 0);
        const progreso = horasTermicas ? this.porcentaje((httTotal / horasTermicas) * 100) : 0;
        const alcanzado = serie.find((dia) => Number(dia.httAcumulado || 0) >= horasTermicas);
        const estimacion = alcanzado
          ? { fechaEstimada: alcanzado.fecha, diasEstimados: 0 }
          : this.estimarFechaUmbral(serie, horasTermicas, httTotal);

        return {
          porcentaje: umbral.porcentaje,
          horasTermicas,
          progreso: this.round(progreso, 0),
          estado: progreso >= 100 ? 'alcanzado' : progreso >= 65 ? 'cercano' : 'en seguimiento',
          ...estimacion,
        };
      });
  }

  private estimarFechaUmbral(
    serie: IPrediccionMalezaDia[],
    horasTermicas: number,
    httTotal: number,
  ): { fechaEstimada?: string; diasEstimados?: number } {
    if (!horasTermicas || httTotal >= horasTermicas || !serie.length) return {};
    const ultimos = serie.slice(-7).map((dia) => Number(dia.httDia || 0)).filter((value) => value > 0);
    const promedio = ultimos.length ? ultimos.reduce((sum, value) => sum + value, 0) / ultimos.length : 0;
    if (promedio <= 0) return {};
    const diasEstimados = Math.ceil((horasTermicas - httTotal) / promedio);
    const ultimaFecha = serie[serie.length - 1]?.fecha;
    return {
      diasEstimados,
      fechaEstimada: ultimaFecha ? this.shiftDateKey(ultimaFecha, diasEstimados) : undefined,
    };
  }

  private severidadMalezas(
    avancePct: number,
    emergenciaPct: number,
  ): TSeveridadPrediccionMaleza {
    if (emergenciaPct >= 10 || avancePct >= 100) return 'alta';
    if (emergenciaPct >= 5 || avancePct >= 65) return 'media';
    return 'baja';
  }

  private lecturaCortaMalezas(
    severidad: TSeveridadPrediccionMaleza,
    emergenciaActualPct: number,
    emergenciaProyectadaPct: number,
    progresoE10: number,
  ): string {
    if (severidad === 'alta') {
      return `Control temprano: E10 al ${this.round(progresoE10, 0)}%.`;
    }
    if (severidad === 'media') {
      return `Monitorear nacimientos: sube de ${this.round(emergenciaActualPct, 1)}% a ${this.round(emergenciaProyectadaPct, 1)}%.`;
    }
    return `Emergencia baja: ${this.round(emergenciaProyectadaPct, 1)}% proyectado.`;
  }

  private recomendacionMaleza(severidad: TSeveridadPrediccionMaleza, maleza: IMaleza): string {
    if (severidad === 'alta') {
      return (
        maleza.recomendaciones?.find((item) => item.momento?.includes('E10'))?.accion ||
        'Revisar lote y definir control temprano.'
      );
    }
    if (severidad === 'media') {
      return 'Entrar a monitorear nacimientos y comparar contra zonas humedas, bordes y compactaciones.';
    }
    return 'Mantener seguimiento; usar recorrida para validar nacimientos y ajustar residualidad.';
  }

  private detalleFuenteMalezas(sensor: SensorSueloReferencia, dias: number): string {
    const temp = sensor.temperatura !== undefined
      ? `${this.round(sensor.temperatura, 1)} C de suelo como referencia de arranque`
      : 'temperatura media diaria de Open-Meteo';
    const humedad = sensor.humedad !== undefined
      ? `${this.round(sensor.humedad * 100, 0)}% de humedad de suelo como referencia de arranque`
      : 'proxy hidrico diario por lluvia y ET0';
    return `Acumula ${dias} dias con ${temp} y ${humedad}.`;
  }

  private calidadPrediccionMalezas(
    sensor: SensorSueloReferencia,
    diasHistorico: number,
    diasPronostico: number,
  ): TCalidadPrediccionMalezas {
    const tieneSensorCompleto = sensor.temperatura !== undefined && sensor.humedad !== undefined;
    if (tieneSensorCompleto && diasHistorico >= 14 && diasPronostico >= 3) return 'alta';
    if (diasHistorico >= 7 && diasPronostico >= 3) return 'media';
    return 'baja';
  }

  private getSensorSueloReferencia(lote: ILote): SensorSueloReferencia {
    const dispositivo = lote.dispositivos?.find((item) => item.tipo === 'Sensor de Humedad de Suelo');
    return {
      temperatura: this.promedioValoresSensor(dispositivo, 'Temperatura Suelo'),
      humedad: this.humedadSueloReferencia(dispositivo),
    };
  }

  private promedioValoresSensor(dispositivo: IDispositivo | undefined, sensor: string): number | undefined {
    const valores = (dispositivo?.ultimoReporte?.datos?.valores as any)?.[sensor];
    if (!Array.isArray(valores)) return undefined;
    const numeros = valores
      .slice(0, 3)
      .map((item) => this.toNumber(item?.valores?.actual ?? item?.valores?.promedio))
      .filter((valor): valor is number => valor !== undefined);
    if (!numeros.length) return undefined;
    return numeros.reduce((sum, value) => sum + value, 0) / numeros.length;
  }

  private humedadSueloReferencia(dispositivo: IDispositivo | undefined): number | undefined {
    const valores =
      (dispositivo?.ultimoReporte?.datos?.valores as any)?.['Humedad Suelo Profundidad'] ||
      (dispositivo?.ultimoReporte?.datos?.valores as any)?.['Humedad Suelo Superficial'];
    if (!Array.isArray(valores)) return undefined;
    const numeros = valores
      .slice(0, 3)
      .map((item) => this.normalizarHumedadSensor(this.toNumber(item?.valores?.actual ?? item?.valores?.promedio), item?.unidad))
      .filter((valor): valor is number => valor !== undefined);
    if (!numeros.length) return undefined;
    const promedio = numeros.reduce((sum, value) => sum + value, 0) / numeros.length;
    return this.clamp(promedio / 100, 0, 1);
  }

  private normalizarHumedadSensor(value: number | undefined, unidad?: string): number | undefined {
    if (value === undefined) return undefined;
    const unidadNormalizada = String(unidad || '').toLowerCase().replace(/\s/g, '');
    if (value > 100 && value <= 300) return (value / 300) * 100;
    if (unidadNormalizada.includes('%')) return this.clamp(value, 0, 100);
    if ((unidadNormalizada.includes('m3/m3') || unidadNormalizada.includes('vwc')) && value >= 0 && value <= 1) {
      return value * 100;
    }
    if (value >= 0 && value <= 3) return (value / 3) * 100;
    if (value > 300 && value <= 1000) return value / 10;
    return this.clamp(value, 0, 100);
  }

  private humedadProxyMalezas(dia: DiaClimaMalezas): number {
    const lluvia = Number(dia.lluviaMm || 0);
    const et0 = Number(dia.et0Mm || 0);
    return this.clamp(0.12 + lluvia / 90 - et0 / 80, 0.05, 0.45);
  }

  private gompertz(htt: number, k: number, beta: number, mu: number): number {
    if (!k || !beta || !mu) return 0;
    return this.round(k * Math.exp(-Math.exp(-beta * (htt - mu))), 1);
  }

  private getCentroLote(lote: ILote, siembra: ISiembra): { lat: number; lng: number } | undefined {
    const centro = lote.ubicacion?.centro || siembra.coordenadas;
    const lat = this.toNumber((centro as any)?.lat);
    const lng = this.toNumber((centro as any)?.lng);
    if (lat === undefined || lng === undefined) return undefined;
    return { lat, lng };
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
      Cebada: [
        {
          nombre: 'Mancha en Red',
          periodo: 'Emergencia a espigazon',
          etapas: ['Emergencia', 'Primer Nudo', 'Hoja Bandera', 'Espigazon'],
          humedadBase: 82,
          horasMojadoCriticas: 12,
          lluviaCritica: 8,
          tempOptima: 17,
          prescripcion: 'DMI + QoI/SDHI registrado en cebada; validar destino cervecero y marbete.',
        },
        {
          nombre: 'Escaldadura de la Cebada',
          periodo: 'Emergencia a hoja bandera',
          etapas: ['Emergencia', 'Primer Nudo', 'Hoja Bandera'],
          humedadBase: 85,
          horasMojadoCriticas: 14,
          lluviaCritica: 6,
          tempOptima: 13,
          prescripcion: 'Triazol + estrobilurina/carboxamida registrada; integrar rastrojo y sintomas.',
        },
        {
          nombre: 'Roya de la Hoja de Cebada',
          periodo: 'Primer nudo a llenado',
          etapas: ['Primer Nudo', 'Hoja Bandera', 'Espigazon', 'Antesis', 'Llenado de Granos'],
          humedadBase: 70,
          horasMojadoCriticas: 8,
          lluviaCritica: 4,
          tempOptima: 18,
          prescripcion: 'Triazol o mezcla doble; proteger hojas funcionales con riesgo sostenido.',
        },
        {
          nombre: 'Fusariosis de la Espiga de Cebada',
          periodo: 'Espigazon y antesis',
          etapas: ['Espigazon', 'Antesis', 'Llenado de Granos'],
          humedadBase: 78,
          horasMojadoCriticas: 18,
          lluviaCritica: 5,
          tempOptima: 20,
          prescripcion: 'Triazol especifico de espiga; evitar estrobilurina sola y validar calidad/micotoxinas.',
        },
      ],
    };

    return base[cultivo] || base.Trigo;
  }

  private getSusceptibilidadVarietal(
    enfermedad: string,
    base: number,
    resistencias: Array<{ enfermedad?: string; multiplicador?: number }>,
  ): number {
    const match = resistencias.find((item) => this.norm(item.enfermedad) === this.norm(enfermedad));
    const value = Number(match?.multiplicador ?? base);
    return this.clamp(Number.isFinite(value) ? value : base, 0.05, 1.2);
  }

  private norm(value?: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
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

  private async getClimaMalezasOpenMeteo(
    lat: number,
    lng: number,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<DiaClimaMalezas[]> {
    const desde = this.toDateKey(fechaDesde);
    const hasta = this.toDateKey(fechaHasta);
    if (desde > hasta) {
      throw new BadRequestException('La fecha hasta no puede ser anterior a la fecha desde para malezas.');
    }

    const hoy = this.toDateKey(new Date().toISOString());
    const ayer = this.shiftDateKey(hoy, -1);
    const resultados: DiaClimaMalezas[] = [];

    if (desde <= ayer) {
      const end = hasta < ayer ? hasta : ayer;
      resultados.push(...(await this.fetchOpenMeteoMalezas('archive', lat, lng, desde, end)));
    }
    if (hasta >= hoy) {
      const start = desde > hoy ? desde : hoy;
      resultados.push(...(await this.fetchOpenMeteoMalezas('forecast', lat, lng, start, hasta)));
    }

    const byDate = new Map<string, DiaClimaMalezas>();
    resultados.forEach((dia) => byDate.set(dia.fecha, dia));
    return [...byDate.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
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

  private async fetchOpenMeteoMalezas(
    tipo: 'archive' | 'forecast',
    lat: number,
    lng: number,
    desde: string,
    hasta: string,
  ): Promise<DiaClimaMalezas[]> {
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
    url.searchParams.set('daily', 'temperature_2m_mean,precipitation_sum,et0_fao_evapotranspiration');
    url.searchParams.set('timezone', 'America/Argentina/Buenos_Aires');

    try {
      const { data } = await axios.get(url.toString(), { timeout: 15000 });
      const fechas: string[] = data?.daily?.time || [];
      const temperaturas: number[] = data?.daily?.temperature_2m_mean || [];
      const lluvias: number[] = data?.daily?.precipitation_sum || [];
      const et0: number[] = data?.daily?.et0_fao_evapotranspiration || [];
      return fechas.map((fecha, index) => ({
        fecha,
        tipo: tipo === 'archive' ? 'historico' : 'pronostico',
        temperaturaMedia: this.toNumber(temperaturas[index]),
        lluviaMm: Number(lluvias[index] || 0),
        et0Mm: Number(et0[index] || 0),
      }));
    } catch (error) {
      this.logger.error(`Error Open-Meteo malezas ${tipo} ${desde}/${hasta}: ${error}`);
      throw new BadRequestException('No se pudo obtener clima Open-Meteo para calcular malezas.');
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

  private diffDias(desde: string, hasta: string): number {
    const start = new Date(`${desde}T00:00:00Z`).getTime();
    const end = new Date(`${hasta}T00:00:00Z`).getTime();
    return Math.max(0, Math.round((end - start) / 86400000));
  }

  private toNumber(valor: unknown): number | undefined {
    const number = Number(valor);
    return Number.isFinite(number) ? number : undefined;
  }

  private porcentaje(valor: number): number {
    return this.clamp(valor, 0, 100);
  }
}
