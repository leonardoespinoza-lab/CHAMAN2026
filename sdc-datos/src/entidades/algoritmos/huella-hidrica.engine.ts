import { BadRequestException } from '@nestjs/common';
import { IFertilizacion, IFumigacion, IHuellaHidrica, ILote, ISiembra } from 'modelos/src';

type Dict<T = number> = Record<string, T>;

export interface DiaClimaHuella {
  fecha: string;
  lluviaMm: number;
  et0Mm: number;
}

export interface HuellaHidricaParams {
  siembra: ISiembra;
  lote: ILote;
  fertilizaciones?: IFertilizacion[];
  fumigaciones?: IFumigacion[];
  clima?: DiaClimaHuella[];
}

export interface HuellaHidricaResultado {
  huella: IHuellaHidrica;
  inputs: {
    cultivo?: string;
    rendimientoSecoKgHa: number;
    diasClima: number;
    fertilizaciones: number;
    fumigaciones: number;
  };
  parciales: {
    etVerdeMm: number;
    etAzulMm: number;
    grisFertilizantesLitrosKg: number;
    grisAgroquimicosLitrosKg: number;
    aporteN: number;
    aporteP: number;
    extraccionN: number;
    extraccionP: number;
    excedenteN: number;
    excedenteP: number;
  };
  trazas: string[];
}

export interface HuellaHidricaFaltante {
  campo: string;
  accion: string;
  bloque: 'siembra' | 'lote' | 'clima' | 'rendimiento';
}

export interface HuellaHidricaSeguimientoResultado {
  estado: 'seguimiento' | 'final';
  periodo: {
    desde?: string;
    hasta?: string;
    diasClima: number;
    diasDesdeSiembra: number;
    diasCiclo: number;
    avanceCiclo: number;
  };
  progreso: {
    verde: {
      mm: number;
      litrosHa: number;
      litrosKg?: number;
      porcentaje: number;
      detalle: string;
    };
    azul: {
      mm: number;
      litrosHa: number;
      litrosKg?: number;
      porcentaje: number;
      detalle: string;
    };
    gris: {
      litrosHa: number;
      litrosKg?: number;
      aplicaciones: number;
      porcentaje: number;
      detalle: string;
    };
    total: {
      litrosHa: number;
      litrosKg?: number;
      porcentaje: number;
      detalle: string;
    };
  };
  inputs: {
    cultivo?: string;
    rendimientoSecoKgHa?: number;
    fertilizaciones: number;
    fumigaciones: number;
    climaDisponible: boolean;
  };
  faltantes: HuellaHidricaFaltante[];
  trazas: string[];
}

interface Stage {
  name: string;
  kcProm: number;
  days: number;
}

const EQ: Record<string, Dict> = {
  depositoN: { '< 0.5': 0, '> 0.5': 0.33, '< 1.5': 0.67, '> 1.5': 1 },
  texturaLixiviacion: { Arcilloso: 0, 'Franco arcilloso': 0.33, Franco: 0.33, 'Franco arenoso': 0.67, Arenoso: 1 },
  texturaEscorrentia: { Arcilloso: 0, 'Franco arcilloso': 0.33, Franco: 0.33, 'Franco arenoso': 0.67, Arenoso: 1 },
  drenajeNaturalLixiviacion: { 'Mal Drenado': 0, 'Moderadamente Drenado': 0.33, 'Bien Drenado': 0.67, 'Excesivamente Drenado': 1 },
  drenajeNaturalEscorrentia: { 'Mal Drenado': 0, 'Moderadamente Drenado': 0.33, 'Bien Drenado': 0.67, 'Excesivamente Drenado': 1 },
  erosionEscorrentiaPendiente: { 'Baja (0 - 3%)': 0, 'Moderada (3 - 8%)': 0.33, 'Alta (8 - 15%)': 0.67, 'Muy Alta (> 15%)': 1 },
  contenidoP: { '< 12': 0, '> 12 < 20': 0.33, '> 20 < 30': 0.67, '> 30': 1 },
  lluviasPromedio: { '< 600': 0, '> 600 < 1200': 0.33, '> 1200 < 1800': 0.67, '> 1800': 1 },
  fijacionN: { '0': 0, '> 0 < 30': 0.33, '> 30 < 60': 0.67, '> 60': 1 },
  dosisN: { 'Muy Baja': 0, Baja: 0.33, Alta: 0.67, 'Muy Alta': 1 },
  dosisP: { 'Muy Baja': 0, Baja: 0.33, Alta: 0.67, 'Muy Alta': 1 },
  rendimiento: { 'Muy Bajo': 1, Bajo: 0.67, Alto: 0.33, 'Muy Alto': 0 },
  manejoAgronomico: { Malo: 1, Promedio: 0.67, Bueno: 0.33, Excelente: 0 },
  intensidadLluvias: { Suaves: 0, Moderadas: 0.33, Intensas: 0.67, 'Muy Intensas': 1 },
  materiaOrganica: { '< 1': 1, '> 1 < 3': 0.67, '> 3 < 5': 0.33, '> 5': 0 },
};

const PESOS_N: Dict = {
  depositoN: 10,
  texturaLixiviacion: 15,
  texturaEscorrentia: 10,
  drenajeNaturalLixiviacion: 15,
  drenajeNaturalEscorrentia: 10,
  lluviasPromedio: 15,
  fijacionN: 10,
  dosisN: 0,
  rendimiento: 0,
  manejoAgronomico: 15,
};

const PESOS_P: Dict = {
  texturaLixiviacion: 25,
  erosionEscorrentiaPendiente: 25,
  contenidoP: 20,
  intensidadLluvias: 15,
  dosisP: 0,
  rendimiento: 0,
  manejoAgronomico: 15,
};

const PESOS_CPP: Dict = {
  koc: 20,
  persistenciaLixiviacion: 15,
  persistenciaEscorrentia: 10,
  texturaLixiviacion: 15,
  texturaEscorrentia: 10,
  materiaOrganica: 10,
  intensidadLluvias: 5,
  lluviasPromedio: 5,
  manejoAgronomico: 10,
};

const EXTRACCION_N: Dict = { Soja: 55, Trigo: 20.55, Maiz: 15 };
const EXTRACCION_P: Dict = { Soja: 6.12997, Trigo: 3.99, Maiz: 3.0228 };
const KCAL_X_KG: Dict = { Maiz: 3650, Trigo: 3400, Soja: 4100 };

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function val(tabla: string, key?: string): number {
  if (!key) return 0;
  return EQ[tabla]?.[key] ?? 0;
}

function kcToKcal(litrosKg: number, cultivo?: string): number {
  const kcalKg = KCAL_X_KG[cultivo || ''] || 1;
  return round(litrosKg / kcalKg, 6);
}

function validar(siembra: ISiembra, lote: ILote, clima?: DiaClimaHuella[]) {
  const faltantes: string[] = [];
  const requeridosSiembra: Array<[keyof ISiembra, string]> = [
    ['fechaSiembra', 'fecha de siembra'],
    ['fechaCosecha', 'fecha de cosecha'],
    ['rendimientoObtenidoKgHaSeco', 'rendimiento seco'],
    ['lluviasPromedio', 'lluvias promedio'],
    ['fijacionN', 'fijacion N'],
    ['dosisN', 'dosis N'],
    ['dosisP', 'dosis P'],
    ['rendimiento', 'rango de rendimiento'],
    ['manejoAgronomico', 'manejo agronomico'],
    ['intensidadLluvias', 'intensidad de lluvias'],
    ['materiaOrganica', 'materia organica'],
    ['labranza', 'labranza'],
  ];
  const requeridosLote: Array<[keyof ILote, string]> = [
    ['depositoN', 'deposito N del lote'],
    ['texturaLixiviacion', 'textura lixiviacion'],
    ['texturaEscorrentia', 'textura escorrentia'],
    ['drenajeNaturalLixiviacion', 'drenaje natural lixiviacion'],
    ['drenajeNaturalEscorrentia', 'drenaje natural escorrentia'],
    ['erosionEscorrentiaPendiente', 'erosion/pendiente'],
    ['contenidoP', 'contenido P'],
  ];

  for (const [key, label] of requeridosSiembra) {
    if (siembra[key] == null || siembra[key] === '') faltantes.push(label);
  }
  for (const [key, label] of requeridosLote) {
    if (lote[key] == null || lote[key] === '') faltantes.push(label);
  }
  if (!clima?.length) faltantes.push('clima diario entre siembra y cosecha');
  if (Number(siembra.rendimientoObtenidoKgHaSeco || 0) <= 0) {
    faltantes.push('rendimiento seco mayor a cero');
  }

  if (faltantes.length) {
    throw new BadRequestException(`No se puede calcular huella hidrica. Faltan: ${faltantes.join(', ')}`);
  }
}

function getStages(cultivo?: string, crono?: any): Stage[] {
  const stagesMaiz: Stage[] = [
    { name: 'Siembra', kcProm: 0.1, days: 0 },
    { name: 'siembra_emergencia', kcProm: 0.175, days: 12 },
    { name: 'emergencia_floracion', kcProm: 1.2, days: 76 },
    { name: 'floracion_madurez', kcProm: 0.125, days: 160 },
  ];
  const stagesSoja: Stage[] = [
    { name: 'Siembra', kcProm: 0.1, days: 0 },
    { name: 'siembra_emergencia', kcProm: 0.4, days: 10 },
    { name: 'emergencia_R1', kcProm: 1.05, days: 44 },
    { name: 'R1_R3', kcProm: 1.02, days: 66 },
    { name: 'R3_R5', kcProm: 0.85, days: 80 },
    { name: 'R5_R7', kcProm: 0.4, days: 118 },
  ];
  const stagesTrigo: Stage[] = [
    { name: 'Siembra', kcProm: 0.1, days: 0 },
    { name: 'R0_R1', kcProm: 0.3, days: 13 },
    { name: 'R1_R2', kcProm: 0.5, days: 86 },
    { name: 'R2_R3', kcProm: 0.75, days: 107 },
    { name: 'R3_R4', kcProm: 0.95, days: 123 },
    { name: 'R4_R5', kcProm: 1.15, days: 127 },
    { name: 'R5_R6', kcProm: 0.9, days: 134 },
    { name: 'R6_R7', kcProm: 0.4, days: 158 },
  ];

  const etapas = crono?.etapas || {};

  if (cultivo === 'Trigo') {
    let acumulado = etapas.R0_R1 || stagesTrigo[1].days;
    stagesTrigo[1].days = acumulado;
    for (let i = 2; i < stagesTrigo.length; i++) {
      const stage = stagesTrigo[i];
      acumulado += etapas[stage.name] || Math.max(stage.days - stagesTrigo[i - 1].days, 1);
      stage.days = acumulado;
    }
    return stagesTrigo;
  }

  if (cultivo === 'Maiz') {
    let acumulado = etapas.siembra_emergencia || stagesMaiz[1].days;
    stagesMaiz[1].days = acumulado;
    for (let i = 2; i < stagesMaiz.length; i++) {
      const stage = stagesMaiz[i];
      acumulado += etapas[stage.name] || Math.max(stage.days - stagesMaiz[i - 1].days, 1);
      stage.days = acumulado;
    }
    return stagesMaiz;
  }

  if (cultivo === 'Soja') {
    let acumulado = etapas.siembra_emergencia || stagesSoja[1].days;
    stagesSoja[1].days = acumulado;
    for (let i = 2; i < stagesSoja.length; i++) {
      const stage = stagesSoja[i];
      acumulado += etapas[stage.name] || Math.max(stage.days - stagesSoja[i - 1].days, 1);
      stage.days = acumulado;
    }
    return stagesSoja;
  }

  return [
    { name: 'Inicio', kcProm: 0.35, days: 0 },
    { name: 'Desarrollo', kcProm: 0.8, days: 60 },
    { name: 'Maximo consumo', kcProm: 1, days: 120 },
    { name: 'Cierre', kcProm: 0.6, days: 180 },
  ];
}

function getKc(diasDesdeSiembra: number, cultivo?: string, crono?: any): number {
  const stages = getStages(cultivo, crono);
  if (diasDesdeSiembra <= stages[0].days) return stages[0].kcProm;
  if (diasDesdeSiembra >= stages[stages.length - 1].days) return stages[stages.length - 1].kcProm;

  for (let i = 0; i < stages.length - 1; i++) {
    const current = stages[i];
    const next = stages[i + 1];
    if (diasDesdeSiembra >= current.days && diasDesdeSiembra <= next.days) {
      const span = Math.max(next.days - current.days, 1);
      const proportion = (diasDesdeSiembra - current.days) / span;
      return round(current.kcProm + proportion * (next.kcProm - current.kcProm), 2);
    }
  }
  return stages[0].kcProm;
}

function getPendiente(lote: ILote): number {
  switch (lote.erosionEscorrentiaPendiente) {
    case 'Baja (0 - 3%)':
      return 0.015;
    case 'Moderada (3 - 8%)':
      return 0.055;
    case 'Alta (8 - 15%)':
      return 0.115;
    case 'Muy Alta (> 15%)':
      return 0.15;
    default:
      return 0.055;
  }
}

function getFactorTextura(lote: ILote): number {
  switch (lote.texturaEscorrentia) {
    case 'Arcilloso':
    case 'Franco arcilloso':
    case 'Franco arenoso':
      return 0.8;
    case 'Franco':
      return 0.85;
    case 'Arenoso':
      return 0.7;
    default:
      return 0.8;
  }
}

function getFactorCobertura(siembra: ISiembra): number {
  switch (siembra.labranza) {
    case 'Siembra Directa':
    case 'Labranza':
      return 0.95;
    case 'Convencional':
      return 0.7;
    case 'Reducida':
      return 0.8;
    default:
      return 0.85;
  }
}

function lluviaEfectiva(siembra: ISiembra, lote: ILote, lluviaMm: number): number {
  const intensidad = lluviaMm > 20 ? 0.7 : lluviaMm > 10 ? 0.8 : 0.9;
  return lluviaMm * intensidad * (1 - getPendiente(lote)) * getFactorTextura(lote) * getFactorCobertura(siembra);
}

function getFaltantesSeguimiento(siembra: ISiembra, lote: ILote, clima?: DiaClimaHuella[]): HuellaHidricaFaltante[] {
  const faltantes: HuellaHidricaFaltante[] = [];
  const add = (campo: string, accion: string, bloque: HuellaHidricaFaltante['bloque']) => {
    faltantes.push({ campo, accion, bloque });
  };

  if (!siembra.fechaSiembra) add('fechaSiembra', 'Cargar fecha de siembra para iniciar el seguimiento.', 'siembra');
  if (!siembra.labranza) add('labranza', 'Configurar labranza para ajustar lluvia efectiva y cobertura.', 'siembra');
  if (!lote.texturaEscorrentia) add('texturaEscorrentia', 'Completar textura del suelo para estimar escorrentia.', 'lote');
  if (!lote.texturaLixiviacion) add('texturaLixiviacion', 'Completar textura del suelo para estimar lixiviacion.', 'lote');
  if (!lote.erosionEscorrentiaPendiente) add('erosionEscorrentiaPendiente', 'Configurar pendiente/erosion del lote.', 'lote');
  if (!lote.drenajeNaturalLixiviacion) add('drenajeNaturalLixiviacion', 'Completar drenaje natural para huella gris.', 'lote');
  if (!lote.drenajeNaturalEscorrentia) add('drenajeNaturalEscorrentia', 'Completar drenaje/escorrentia para huella gris.', 'lote');
  if (!lote.depositoN) add('depositoN', 'Completar deposito de nitrogeno del suelo.', 'lote');
  if (!lote.contenidoP) add('contenidoP', 'Completar contenido de fosforo del suelo.', 'lote');
  if (!siembra.lluviasPromedio) add('lluviasPromedio', 'Configurar rango de lluvias promedio del ambiente.', 'siembra');
  if (!siembra.fijacionN) add('fijacionN', 'Configurar fijacion de nitrogeno esperada.', 'siembra');
  if (!siembra.dosisN) add('dosisN', 'Configurar rango de dosis de nitrogeno.', 'siembra');
  if (!siembra.dosisP) add('dosisP', 'Configurar rango de dosis de fosforo.', 'siembra');
  if (!siembra.rendimiento) add('rendimiento', 'Configurar rango de rendimiento esperado.', 'rendimiento');
  if (!siembra.manejoAgronomico) add('manejoAgronomico', 'Configurar manejo agronomico para ajustar riesgo de perdida.', 'siembra');
  if (!siembra.intensidadLluvias) add('intensidadLluvias', 'Configurar intensidad de lluvias para escorrentia.', 'siembra');
  if (!siembra.materiaOrganica) add('materiaOrganica', 'Completar materia organica para fitosanitarios.', 'lote');
  if (!clima?.length) add('clima', 'Sincronizar clima Open-Meteo para acumular ET0 y lluvia.', 'clima');
  if (Number(siembra.rendimientoObtenidoKgHaSeco || 0) <= 0) {
    add('rendimientoObtenidoKgHaSeco', 'Cargar rendimiento esperado o cerrar cosecha para expresar litros/kg.', 'rendimiento');
  }

  return faltantes;
}

function getDiasCiclo(cultivo?: string, crono?: any): number {
  const stages = getStages(cultivo, crono);
  return Math.max(stages[stages.length - 1]?.days || 1, 1);
}

function getDiasDesdeSiembra(fechaSiembra?: string, fechaHasta?: string): number {
  if (!fechaSiembra || !fechaHasta) return 0;
  const desde = new Date(`${new Date(fechaSiembra).toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  const hasta = new Date(`${fechaHasta}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((hasta - desde) / 86400000));
}

function getPotencialesGris(siembra: ISiembra, lote: ILote) {
  const potencialN =
    val('depositoN', lote.depositoN) * PESOS_N.depositoN +
    val('texturaLixiviacion', lote.texturaLixiviacion) * PESOS_N.texturaLixiviacion +
    val('texturaEscorrentia', lote.texturaEscorrentia) * PESOS_N.texturaEscorrentia +
    val('drenajeNaturalLixiviacion', lote.drenajeNaturalLixiviacion) * PESOS_N.drenajeNaturalLixiviacion +
    val('drenajeNaturalEscorrentia', lote.drenajeNaturalEscorrentia) * PESOS_N.drenajeNaturalEscorrentia +
    val('lluviasPromedio', siembra.lluviasPromedio) * PESOS_N.lluviasPromedio +
    val('fijacionN', siembra.fijacionN) * PESOS_N.fijacionN +
    val('dosisN', siembra.dosisN) * PESOS_N.dosisN +
    val('rendimiento', siembra.rendimiento) * PESOS_N.rendimiento +
    val('manejoAgronomico', siembra.manejoAgronomico) * PESOS_N.manejoAgronomico;

  const potencialP =
    val('texturaLixiviacion', lote.texturaLixiviacion) * PESOS_P.texturaLixiviacion +
    val('erosionEscorrentiaPendiente', lote.erosionEscorrentiaPendiente) * PESOS_P.erosionEscorrentiaPendiente +
    val('contenidoP', lote.contenidoP) * PESOS_P.contenidoP +
    val('intensidadLluvias', siembra.intensidadLluvias) * PESOS_P.intensidadLluvias +
    val('dosisP', siembra.dosisP) * PESOS_P.dosisP +
    val('rendimiento', siembra.rendimiento) * PESOS_P.rendimiento +
    val('manejoAgronomico', siembra.manejoAgronomico) * PESOS_P.manejoAgronomico;

  return { potencialN, potencialP };
}

function getGrisLitrosHa(
  siembra: ISiembra,
  lote: ILote,
  fertilizaciones: IFertilizacion[],
  fumigaciones: IFumigacion[],
) {
  const cultivo = siembra.semilla?.cultivo || (siembra as any).cultivo;
  const rendimientoSeco = Number(siembra.rendimientoObtenidoKgHaSeco || 0);
  const { potencialN, potencialP } = getPotencialesGris(siembra, lote);
  const aporteN = fertilizaciones.reduce((acc, f) => acc + (Number(f.dosisKgHa || 0) * Number(f.fertilizante?.porcentajeN || 0)) / 100, 0);
  const aporteP = fertilizaciones.reduce((acc, f) => acc + (Number(f.dosisKgHa || 0) * Number(f.fertilizante?.porcentajeP || 0)) / 100, 0);
  const extraccionN = rendimientoSeco > 0 ? (Number(EXTRACCION_N[cultivo || ''] || 0) * rendimientoSeco) / 1000 : 0;
  const extraccionP = rendimientoSeco > 0 ? (Number(EXTRACCION_P[cultivo || ''] || 0) * rendimientoSeco) / 1000 : 0;
  const excedenteN = Math.max(0, ((aporteN - extraccionN) * potencialN) / 100);
  const excedenteP = Math.max(0, ((aporteP - extraccionP) * potencialP) / 100);
  const grisFertilizantesLitrosHa = (excedenteN / 35) * 1000 + (excedenteP / 4) * 1000;

  const grisAgroquimicosBase = fumigaciones.reduce((acc, f) => {
    const principio = f.principioActivo || {};
    const potencialCpp =
      Number(principio.koc || 0) * PESOS_CPP.koc +
      Number(principio.persistencia || 0) * PESOS_CPP.persistenciaEscorrentia +
      Number(principio.persistencia || 0) * PESOS_CPP.persistenciaLixiviacion +
      val('texturaLixiviacion', lote.texturaLixiviacion) * PESOS_CPP.texturaLixiviacion +
      val('texturaEscorrentia', lote.texturaEscorrentia) * PESOS_CPP.texturaEscorrentia +
      val('materiaOrganica', siembra.materiaOrganica) * PESOS_CPP.materiaOrganica +
      val('intensidadLluvias', siembra.intensidadLluvias) * PESOS_CPP.intensidadLluvias +
      val('lluviasPromedio', siembra.lluviasPromedio) * PESOS_CPP.lluviasPromedio +
      val('manejoAgronomico', siembra.manejoAgronomico) * PESOS_CPP.manejoAgronomico;
    const iaHa = (Number(f.dosisLtHa || 0) * Number(f.concentracion || 0)) / 100;
    return acc + iaHa * potencialCpp;
  }, 0);

  const grisAgroquimicosLitrosHa = grisAgroquimicosBase / 0.0005;
  const litrosHa = Math.max(0, grisFertilizantesLitrosHa + grisAgroquimicosLitrosHa);
  return {
    litrosHa,
    litrosKg: rendimientoSeco > 0 ? (litrosHa / rendimientoSeco) * 1000 : undefined,
    aporteN,
    aporteP,
    extraccionN,
    extraccionP,
  };
}

export function calcularSeguimientoHuellaHidrica(params: HuellaHidricaParams): HuellaHidricaSeguimientoResultado {
  const siembra = params.siembra;
  const lote = params.lote;
  const fertilizaciones = params.fertilizaciones || [];
  const fumigaciones = params.fumigaciones || [];
  const clima = (params.clima || []).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const huellaFinal = siembra.huellaHidrica;
  const cultivo = siembra.semilla?.cultivo || (siembra as any).cultivo;
  const rendimientoSeco = Number(siembra.rendimientoObtenidoKgHaSeco || 0);

  const fechaHasta = clima[clima.length - 1]?.fecha || new Date().toISOString().slice(0, 10);
  const diasDesdeSiembra = getDiasDesdeSiembra(siembra.fechaSiembra, fechaHasta);
  const diasCiclo = getDiasCiclo(cultivo, siembra.crono);
  const avanceCiclo = round(Math.min(100, (diasDesdeSiembra / diasCiclo) * 100), 1);
  const trazas: string[] = [];

  let etVerdeMm = 0;
  let etAzulMm = 0;
  let etcTotalMm = 0;
  clima.forEach((dia, index) => {
    const dias = getDiasDesdeSiembra(siembra.fechaSiembra, dia.fecha);
    const kc = getKc(dias || index, cultivo, siembra.crono);
    const etc = kc * Number(dia.et0Mm || 0);
    const lluviaEf = lluviaEfectiva(siembra, lote, Number(dia.lluviaMm || 0));
    const verdeDia = Math.min(etc, lluviaEf);
    const azulDia = Math.max(etc - lluviaEf, 0);
    etcTotalMm += etc;
    etVerdeMm += verdeDia;
    etAzulMm += azulDia;
    if (index < 3 || index === clima.length - 1) {
      trazas.push(`${dia.fecha}: Kc ${kc}, ETc ${round(etc)} mm, lluvia efectiva ${round(lluviaEf)} mm.`);
    }
  });

  const gris = getGrisLitrosHa(siembra, lote, fertilizaciones, fumigaciones);
  const verdeLitrosHa = etVerdeMm * 10000;
  const azulLitrosHa = etAzulMm * 10000;
  const totalLitrosHa = verdeLitrosHa + azulLitrosHa + gris.litrosHa;
  const divisor = Math.max(etcTotalMm, 1);
  const aplicaciones = fertilizaciones.length + fumigaciones.length;
  const faltantes = getFaltantesSeguimiento(siembra, lote, clima);

  trazas.push(`Seguimiento hasta ${fechaHasta}: verde ${round(etVerdeMm)} mm, azul ${round(etAzulMm)} mm, ETc acumulada ${round(etcTotalMm)} mm.`);
  trazas.push(`Huella gris acumulada por aplicaciones: ${aplicaciones} registros, ${round(gris.litrosHa)} l/ha antes de dividir por rendimiento.`);

  if (huellaFinal) {
    trazas.push('La siembra ya tiene huella final guardada; el seguimiento se muestra como lectura historica.');
  }

  return {
    estado: huellaFinal ? 'final' : 'seguimiento',
    periodo: {
      desde: siembra.fechaSiembra ? new Date(siembra.fechaSiembra).toISOString().slice(0, 10) : undefined,
      hasta: fechaHasta,
      diasClima: clima.length,
      diasDesdeSiembra,
      diasCiclo,
      avanceCiclo,
    },
    progreso: {
      verde: {
        mm: round(etVerdeMm),
        litrosHa: round(verdeLitrosHa),
        litrosKg: rendimientoSeco > 0 ? round((verdeLitrosHa / rendimientoSeco) * 1000) : undefined,
        porcentaje: round(Math.min(100, (etVerdeMm / divisor) * 100), 1),
        detalle: 'Lluvia efectiva consumida por el cultivo hasta hoy.',
      },
      azul: {
        mm: round(etAzulMm),
        litrosHa: round(azulLitrosHa),
        litrosKg: rendimientoSeco > 0 ? round((azulLitrosHa / rendimientoSeco) * 1000) : undefined,
        porcentaje: round(Math.min(100, (etAzulMm / divisor) * 100), 1),
        detalle: 'Deficit hidrico cubierto por riego o agua externa pendiente.',
      },
      gris: {
        litrosHa: round(gris.litrosHa),
        litrosKg: rendimientoSeco > 0 && gris.litrosKg != null ? round(gris.litrosKg) : undefined,
        aplicaciones,
        porcentaje: round(Math.min(100, aplicaciones * 25), 1),
        detalle: 'Carga potencial de fertilizaciones y fitosanitarios registrados.',
      },
      total: {
        litrosHa: round(totalLitrosHa),
        litrosKg: rendimientoSeco > 0 ? round((totalLitrosHa / rendimientoSeco) * 1000) : undefined,
        porcentaje: avanceCiclo,
        detalle: `Seguimiento del ciclo: ${avanceCiclo}% con ${clima.length} dias climaticos.`,
      },
    },
    inputs: {
      cultivo,
      rendimientoSecoKgHa: rendimientoSeco > 0 ? round(rendimientoSeco, 2) : undefined,
      fertilizaciones: fertilizaciones.length,
      fumigaciones: fumigaciones.length,
      climaDisponible: clima.length > 0,
    },
    faltantes,
    trazas,
  };
}

export function calcularHuellaHidrica(params: HuellaHidricaParams): HuellaHidricaResultado {
  const siembra = params.siembra;
  const lote = params.lote;
  const fertilizaciones = params.fertilizaciones || [];
  const fumigaciones = params.fumigaciones || [];
  const clima = params.clima || [];
  validar(siembra, lote, clima);

  const trazas: string[] = [];
  const cultivo = siembra.semilla?.cultivo || (siembra as any).cultivo;
  const rendimientoSeco = Number(siembra.rendimientoObtenidoKgHaSeco || 0);

  let etVerdeMm = 0;
  let etAzulMm = 0;
  clima.forEach((dia, index) => {
    const kc = getKc(index, cultivo, siembra.crono);
    const etc = kc * Number(dia.et0Mm || 0);
    const lluviaEf = lluviaEfectiva(siembra, lote, Number(dia.lluviaMm || 0));
    const verdeDia = Math.min(etc, lluviaEf);
    const azulDia = Math.max(etc - lluviaEf, 0);
    etVerdeMm += verdeDia;
    etAzulMm += azulDia;
    if (index < 5 || index === clima.length - 1) {
      trazas.push(`${dia.fecha}: Kc ${kc}, ETc ${round(etc)} mm, lluvia efectiva ${round(lluviaEf)} mm, verde ${round(verdeDia)} mm, azul ${round(azulDia)} mm.`);
    }
  });

  const potencialN =
    val('depositoN', lote.depositoN) * PESOS_N.depositoN +
    val('texturaLixiviacion', lote.texturaLixiviacion) * PESOS_N.texturaLixiviacion +
    val('texturaEscorrentia', lote.texturaEscorrentia) * PESOS_N.texturaEscorrentia +
    val('drenajeNaturalLixiviacion', lote.drenajeNaturalLixiviacion) * PESOS_N.drenajeNaturalLixiviacion +
    val('drenajeNaturalEscorrentia', lote.drenajeNaturalEscorrentia) * PESOS_N.drenajeNaturalEscorrentia +
    val('lluviasPromedio', siembra.lluviasPromedio) * PESOS_N.lluviasPromedio +
    val('fijacionN', siembra.fijacionN) * PESOS_N.fijacionN +
    val('dosisN', siembra.dosisN) * PESOS_N.dosisN +
    val('rendimiento', siembra.rendimiento) * PESOS_N.rendimiento +
    val('manejoAgronomico', siembra.manejoAgronomico) * PESOS_N.manejoAgronomico;

  const potencialP =
    val('texturaLixiviacion', lote.texturaLixiviacion) * PESOS_P.texturaLixiviacion +
    val('erosionEscorrentiaPendiente', lote.erosionEscorrentiaPendiente) * PESOS_P.erosionEscorrentiaPendiente +
    val('contenidoP', lote.contenidoP) * PESOS_P.contenidoP +
    val('intensidadLluvias', siembra.intensidadLluvias) * PESOS_P.intensidadLluvias +
    val('dosisP', siembra.dosisP) * PESOS_P.dosisP +
    val('rendimiento', siembra.rendimiento) * PESOS_P.rendimiento +
    val('manejoAgronomico', siembra.manejoAgronomico) * PESOS_P.manejoAgronomico;

  const aporteN = fertilizaciones.reduce((acc, f) => acc + (Number(f.dosisKgHa || 0) * Number(f.fertilizante?.porcentajeN || 0)) / 100, 0);
  const aporteP = fertilizaciones.reduce((acc, f) => acc + (Number(f.dosisKgHa || 0) * Number(f.fertilizante?.porcentajeP || 0)) / 100, 0);
  const extraccionN = (Number(EXTRACCION_N[cultivo || ''] || 0) * rendimientoSeco) / 1000;
  const extraccionP = (Number(EXTRACCION_P[cultivo || ''] || 0) * rendimientoSeco) / 1000;
  const excedenteN = Math.max(0, ((aporteN - extraccionN) * potencialN) / 100);
  const excedenteP = Math.max(0, ((aporteP - extraccionP) * potencialP) / 100);
  const litrosHaN = (excedenteN / 35) * 1000;
  const litrosHaP = (excedenteP / 4) * 1000;
  const grisFertilizantes = (litrosHaN / rendimientoSeco) * 1000 + (litrosHaP / rendimientoSeco) * 1000;

  const grisAgroquimicos = fumigaciones.reduce((acc, f) => {
    const principio = f.principioActivo || {};
    const potencialCpp =
      Number(principio.koc || 0) * PESOS_CPP.koc +
      Number(principio.persistencia || 0) * PESOS_CPP.persistenciaEscorrentia +
      Number(principio.persistencia || 0) * PESOS_CPP.persistenciaLixiviacion +
      val('texturaLixiviacion', lote.texturaLixiviacion) * PESOS_CPP.texturaLixiviacion +
      val('texturaEscorrentia', lote.texturaEscorrentia) * PESOS_CPP.texturaEscorrentia +
      val('materiaOrganica', siembra.materiaOrganica) * PESOS_CPP.materiaOrganica +
      val('intensidadLluvias', siembra.intensidadLluvias) * PESOS_CPP.intensidadLluvias +
      val('lluviasPromedio', siembra.lluviasPromedio) * PESOS_CPP.lluviasPromedio +
      val('manejoAgronomico', siembra.manejoAgronomico) * PESOS_CPP.manejoAgronomico;
    const iaHa = (Number(f.dosisLtHa || 0) * Number(f.concentracion || 0)) / 100;
    return acc + iaHa * potencialCpp;
  }, 0);
  const grisAgroquimicosLitrosKg = Math.max(0, grisAgroquimicos / 0.0005 / rendimientoSeco);

  const verdeLitrosKg = (etVerdeMm * 10000) / rendimientoSeco;
  const azulLitrosKg = (etAzulMm * 10000) / rendimientoSeco;
  const grisLitrosKg = grisFertilizantes + grisAgroquimicosLitrosKg;
  const totalLitrosKg = verdeLitrosKg + azulLitrosKg + grisLitrosKg;

  trazas.push(`Verde/Azul: ET verde ${round(etVerdeMm)} mm y ET azul ${round(etAzulMm)} mm sobre ${clima.length} dias.`);
  trazas.push(`Gris fertilizantes: aporte N ${round(aporteN)} kg/ha, extraccion N ${round(extraccionN)} kg/ha, excedente N ${round(excedenteN)}; aporte P ${round(aporteP)} kg/ha, extraccion P ${round(extraccionP)} kg/ha, excedente P ${round(excedenteP)}.`);
  trazas.push(`Gris fitosanitarios: ${fumigaciones.length} aplicaciones evaluadas con Koc, persistencia, dosis y concentracion.`);

  return {
    huella: {
      verde: { litrosKg: round(verdeLitrosKg), litrosKcal: kcToKcal(verdeLitrosKg, cultivo) },
      azul: { litrosKg: round(azulLitrosKg), litrosKcal: kcToKcal(azulLitrosKg, cultivo) },
      gris: {
        litrosKgFertilizante: round(grisFertilizantes),
        litrosKgAgroquimico: round(grisAgroquimicosLitrosKg),
        litrosKg: round(grisLitrosKg),
        litrosKcal: kcToKcal(grisLitrosKg, cultivo),
      },
      total: { litrosKg: round(totalLitrosKg), litrosKcal: kcToKcal(totalLitrosKg, cultivo) },
    },
    inputs: {
      cultivo,
      rendimientoSecoKgHa: round(rendimientoSeco, 2),
      diasClima: clima.length,
      fertilizaciones: fertilizaciones.length,
      fumigaciones: fumigaciones.length,
    },
    parciales: {
      etVerdeMm: round(etVerdeMm),
      etAzulMm: round(etAzulMm),
      grisFertilizantesLitrosKg: round(grisFertilizantes),
      grisAgroquimicosLitrosKg: round(grisAgroquimicosLitrosKg),
      aporteN: round(aporteN),
      aporteP: round(aporteP),
      extraccionN: round(extraccionN),
      extraccionP: round(extraccionP),
      excedenteN: round(excedenteN),
      excedenteP: round(excedenteP),
    },
    trazas,
  };
}

export function getHuellaHidricaConstantes() {
  return {
    equivalencias: EQ,
    pesos: { nitrogeno: PESOS_N, fosforo: PESOS_P, fitosanitarios: PESOS_CPP },
    extraccion: { nitrogeno: EXTRACCION_N, fosforo: EXTRACCION_P },
    kcalPorKg: KCAL_X_KG,
    version: 'huella-hidrica-chaman-2026-01',
  };
}
