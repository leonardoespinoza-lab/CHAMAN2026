import { Cultivo } from "./crono";

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
  parametros?: IParametrosGompertzMaleza;
  umbrales?: IUmbralEmergenciaMaleza[];
  recomendaciones?: IRecomendacionMaleza[];
  observaciones?: string;
}

type OmitirCreate = "_id";
export interface ICreateMaleza extends Omit<Partial<IMaleza>, OmitirCreate> {}

type OmitirUpdate = "_id";
export interface IUpdateMaleza extends Omit<Partial<IMaleza>, OmitirUpdate> {}
