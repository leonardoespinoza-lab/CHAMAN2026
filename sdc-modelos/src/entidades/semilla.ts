import { Cultivo } from './crono';

export type TEnfermedad =
  // Trigo
  | 'Fusarium de la Espiga'
  | 'Mancha Amarilla'
  | 'Mancha de la Hoja'
  | 'Roya de la Hoja'
  | 'Roya del Tallo'
  | 'Roya Anaranjada'
  // Soja
  | 'Fin de Ciclo'
  // Maiz
  | 'Roya del Maiz';

export interface IResistencia {
  multiplicador?: number;
  enfermedad?: TEnfermedad;
}

export interface ISemilla {
  _id?: string;
  semillero?: string;
  cultivo?: Cultivo;
  variedad?: string;
  ciclo?: string;
  resistencia?: IResistencia[];
  campania?: string;
}

type OmitirCreate = '_id';
export interface ICreateSemilla extends Omit<Partial<ISemilla>, OmitirCreate> {}

type OmitirUpdate = '_id';
export interface IUpdateSemilla extends Omit<Partial<ISemilla>, OmitirUpdate> {}
