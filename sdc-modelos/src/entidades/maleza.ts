import { Cultivo } from "./crono";

export const PREDICCION_MALEZAS_ENGINE_VERSION = "3.0";

export type TModeloMaleza = "Gompertz HTT";

export interface IParametrosGompertzMaleza {
  kMaxPorcentaje?: number;
  beta?: number;
  muHorasTermicas?: number;
  temperaturaBase?: number;
  humedadTheta50?: number;
  humedadEscala?: number;
  deltaHoras?: number;
}

export interface IUmbralEmergenciaMaleza {
  porcentaje?: number;
  horasTermicas?: number;
  fechaEstimadaReferencia?: string;
  fechaRealReferencia?: string;
}

export interface IRecomendacionMaleza {
  momento?: string;
  accion?: string;
  detalle?: string;
}

export type TEstadoPrediccionMalezas =
  "operativo" | "sin_modelos" | "no_aplica" | "sin_clima";

export type TSeveridadPrediccionMaleza = "baja" | "media" | "alta";

export type TCalidadPrediccionMalezas = "alta" | "media" | "baja";

export type TEstadoSuperficieMalezas =
  | "suelo_expuesto"
  | "vegetacion_incipiente"
  | "cobertura_activa"
  | "no_evaluable";

export type TOrigenSeguimientoMalezas =
  "campania_estival" | "campania_invernal" | "reinicio_manual";

export type TTemporadaEmergenciaMaleza =
  "estival" | "invernal" | "todo_el_anio";

export interface ISeguimientoMalezasLote {
  fechaInicio: string;
  origen: TOrigenSeguimientoMalezas;
  temporada: TTemporadaEmergenciaMaleza;
  actualizadoEn?: string;
}

export interface IContextoLoteMalezas {
  estado: "siembra_activa" | "sin_siembra_registrada";
  etiqueta: string;
  fechaInicio: string;
  origen: TOrigenSeguimientoMalezas;
  temporada: TTemporadaEmergenciaMaleza;
}

export interface IContextoSatelitalMalezas {
  estado: TEstadoSuperficieMalezas;
  etiqueta: string;
  fecha?: string;
  confianza: "alta" | "media" | "baja";
  coberturaValidaPct?: number;
  ndvi?: number;
  ndmi?: number;
  savi?: number;
  evi?: number;
  observacion: string;
}

export interface IPrediccionMalezaDia {
  fecha?: string;
  tipo?: "historico" | "pronostico";
  temperaturaMedia?: number;
  lluviaMm?: number;
  et0Mm?: number;
  humedadSueloPct?: number;
  factorHidrico?: number;
  httDia?: number;
  httAcumulado?: number;
  emergenciaPct?: number;
  fuente?: string;
}

export interface IPrediccionMalezaUmbral {
  porcentaje?: number;
  horasTermicas?: number;
  progreso?: number;
  estado?: "alcanzado" | "cercano" | "en seguimiento";
  fechaEstimada?: string;
  diasEstimados?: number;
}

export interface IPrediccionMalezaEspecie {
  idMaleza?: string;
  codigoCarga?: string;
  nombre?: string;
  nombreCientifico?: string;
  modelo?: TModeloMaleza;
  avancePct?: number;
  emergenciaPct?: number;
  emergenciaActualPct?: number;
  emergenciaProyectada7dPct?: number;
  httHistorico?: number;
  httProyectado7d?: number;
  httTotal?: number;
  temperaturaReferencia?: number;
  humedadReferencia?: number;
  severidad?: TSeveridadPrediccionMaleza;
  estado?: string;
  estadoCorto?: string;
  lecturaCorta?: string;
  recomendacion?: string;
  fuenteDatos?: string;
  detalleFuente?: string;
  formula?: string;
  calidadDatos?: TCalidadPrediccionMalezas;
  temperaturaBase?: number;
  deltaHoras?: number;
  umbrales?: IPrediccionMalezaUmbral[];
  recomendaciones?: IRecomendacionMaleza[];
  observaciones?: string;
  serie?: IPrediccionMalezaDia[];
}

export interface IResultadoPrediccionMalezas {
  fecha?: string;
  versionMotor?: string;
  idSiembra?: string;
  idLote?: string;
  cultivo?: Cultivo;
  estado?: TEstadoPrediccionMalezas;
  resumen?: string;
  fuenteDatos?: string;
  calidadDatos?: TCalidadPrediccionMalezas;
  periodo?: {
    desde?: string;
    hastaHistorico?: string;
    hastaPronostico?: string;
    diasHistorico?: number;
    diasPronostico?: number;
    diasEvaluados?: number;
    recorteDias?: number;
  };
  contextoLote?: IContextoLoteMalezas;
  contextoSatelital?: IContextoSatelitalMalezas;
  especies?: IPrediccionMalezaEspecie[];
  trazas?: string[];
}

/**
 * Una respuesta del motor solo representa cobertura operativa cuando el
 * calculo finalizo y contiene al menos una especie evaluada. Los estados de
 * diagnostico (sin clima, sin modelos o no aplica) siguen siendo trazables,
 * pero no deben presentarse como una prediccion disponible.
 */
export function esPrediccionMalezasOperativa(
  resultado?: IResultadoPrediccionMalezas,
): boolean {
  return (
    resultado?.estado === "operativo" &&
    Array.isArray(resultado.especies) &&
    resultado.especies.length > 0
  );
}

export interface IMaleza {
  _id?: string;
  codigoCarga?: string;
  fuenteBase?: string;
  nombre?: string;
  nombreCientifico?: string;
  cultivosObjetivo?: Cultivo[];
  modelo?: TModeloMaleza;
  temporadaEmergencia?: TTemporadaEmergenciaMaleza;
  parametros?: IParametrosGompertzMaleza;
  umbrales?: IUmbralEmergenciaMaleza[];
  recomendaciones?: IRecomendacionMaleza[];
  observaciones?: string;
}

type OmitirCreate = "_id";
export interface ICreateMaleza extends Omit<Partial<IMaleza>, OmitirCreate> {}

type OmitirUpdate = "_id";
export interface IUpdateMaleza extends Omit<Partial<IMaleza>, OmitirUpdate> {}
