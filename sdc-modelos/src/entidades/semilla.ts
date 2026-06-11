import { Cultivo, TipoCicloCultivo } from './crono';

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
  | 'Roya del Maiz'
  // Vid
  | 'Oidio'
  | 'Botritis'
  | 'Mildiu'
  // Papa
  | 'Tizon Tardio'
  | 'Tizon Temprano'
  | 'Rhizoctonia'
  // Frutales
  | 'Sarna del Manzano'
  | 'Sarna del Peral'
  | 'Sarna del Pecan'
  | 'Oidio del Manzano'
  | 'Fuego Bacteriano'
  | 'Carpocapsa'
  | 'Psila del Peral'
  | 'Bacteriosis del Pecan';

export interface IResistencia {
  multiplicador?: number;
  enfermedad?: TEnfermedad;
}

export interface IRequerimientoFrio {
  horasFrio?: number;
  horasFrioEfectivas?: number;
  porcionesFrio?: number;
  modelo?: "HF" | "HFE" | "CP" | "HF + HFE" | "HF + HFE + CP";
}

export interface IFenologiaReferencia {
  brotacion?: string;
  floracion?: string;
  cosecha?: string;
  etapas?: Record<string, number | string>;
  editable?: boolean;
}

export interface ISemilla {
  _id?: string;
  codigoCarga?: string;
  fuenteBase?: string;
  semillero?: string;
  cultivo?: Cultivo;
  variedad?: string;
  ciclo?: string;
  resistencia?: IResistencia[];
  campania?: string;
  tipoCultivo?: TipoCicloCultivo;
  portainjerto?: string;
  requerimientoFrio?: IRequerimientoFrio;
  fenologiaReferencia?: IFenologiaReferencia;
  observaciones?: string;
}

type OmitirCreate = '_id';
export interface ICreateSemilla extends Omit<Partial<ISemilla>, OmitirCreate> {}

type OmitirUpdate = '_id';
export interface IUpdateSemilla extends Omit<Partial<ISemilla>, OmitirUpdate> {}
