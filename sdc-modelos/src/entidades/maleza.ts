import { Cultivo } from './crono';

export type TModeloMaleza = 'Gompertz HTT';

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

type OmitirCreate = '_id';
export interface ICreateMaleza extends Omit<Partial<IMaleza>, OmitirCreate> {}

type OmitirUpdate = '_id';
export interface IUpdateMaleza extends Omit<Partial<IMaleza>, OmitirUpdate> {}
