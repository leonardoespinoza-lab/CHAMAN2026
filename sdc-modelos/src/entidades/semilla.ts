import { Cultivo, FaseHeladaFenologica, TipoCicloCultivo } from "./crono";

export type TEnfermedad =
  // Trigo
  | "Fusarium de la Espiga"
  | "Mancha Amarilla"
  | "Mancha de la Hoja"
  | "Roya de la Hoja"
  | "Roya del Tallo"
  | "Roya Anaranjada"
  // Cebada
  | "Mancha en Red"
  | "Escaldadura de la Cebada"
  | "Roya de la Hoja de Cebada"
  | "Fusariosis de la Espiga de Cebada"
  // Soja
  | "Fin de Ciclo"
  // Maiz
  | "Roya del Maiz"
  | "Tizon Foliar del Maiz"
  // Arveja (screening ambiental experimental)
  | "Complejo Ascochyta de la Arveja"
  | "Mildiu de la Arveja"
  | "Oidio de la Arveja"
  // Vid
  | "Oidio"
  | "Botritis"
  | "Mildiu"
  // Papa
  | "Tizon Tardio"
  | "Tizon Temprano"
  | "Rhizoctonia"
  // Frutales
  | "Sarna del Manzano"
  | "Sarna del Peral"
  | "Sarna del Pecan"
  | "Oidio del Manzano"
  | "Fuego Bacteriano"
  | "Carpocapsa"
  | "Psila del Peral"
  | "Bacteriosis del Pecan";

export interface IResistencia {
  multiplicador?: number;
  enfermedad?: TEnfermedad;
  idEnfermedad?: TEnfermedadId;
  indiceResistencia?: number;
  perfil?: TPerfilResistencia;
  estado?: TEstadoResistencia;
  confianza?: TConfianzaResistencia;
  fuente?: string;
  fuenteUrl?: string;
  campaniaFuente?: string;
  fechaFuente?: string;
  observaciones?: string;
}

export type TEnfermedadId =
  | "trigo.fusarium_espiga"
  | "trigo.mancha_amarilla"
  | "trigo.mancha_hoja"
  | "trigo.roya_hoja"
  | "trigo.roya_tallo"
  | "trigo.roya_anaranjada"
  | "cebada.mancha_red"
  | "cebada.escaldadura"
  | "cebada.roya_hoja"
  | "cebada.fusariosis_espiga"
  | "soja.fin_ciclo"
  | "maiz.roya"
  | "maiz.tizon_foliar"
  | "arveja.ascochyta"
  | "arveja.mildiu"
  | "arveja.oidio"
  | "vid.oidio"
  | "vid.botritis"
  | "vid.mildiu"
  | "papa.tizon_tardio"
  | "papa.tizon_temprano"
  | "papa.rhizoctonia"
  | "manzano.sarna"
  | "manzano.oidio"
  | "frutales.fuego_bacteriano"
  | "manzano.carpocapsa"
  | "peral.sarna"
  | "peral.psila"
  | "pecan.sarna"
  | "pecan.bacteriosis";

export type TPerfilResistencia =
  | "R"
  | "MR"
  | "I"
  | "MS"
  | "S"
  | "T"
  | "MT"
  | "DESCONOCIDA";

export type TEstadoResistencia =
  | "observada"
  | "historica"
  | "inferida"
  | "desconocida";

export type TConfianzaResistencia = "alta" | "media" | "baja" | "sin_datos";

export interface IRequerimientoFrio {
  horasFrio?: number;
  horasFrioEfectivas?: number;
  porcionesFrio?: number;
  modelo?: "HF" | "HFE" | "CP" | "HF + HFE" | "HF + HFE + CP";
  fuente?: string;
  confianza?: "alta" | "media" | "estimada";
  observaciones?: string;
}

export interface IFenologiaReferencia {
  brotacion?: string;
  floracion?: string;
  cosecha?: string;
  etapas?: Record<string, number | string>;
  edadProductivaDesdeAnios?: number;
  etapasJuveniles?: Record<string, number | string>;
  unidadEtapas?: "dias" | "grados_dia";
  temperaturaBaseC?: number;
  rangosTermicos?: Record<string, { min: number; max: number }>;
  etapasObservables?: string[];
  estadoModelo?: "validado" | "referencia" | "requiere_calibracion";
  observacionesModelo?: string;
  fuente?: string;
  fuenteUrl?: string;
  editable?: boolean;
}

export interface ISensibilidadHelada {
  ajusteUmbralC?: number;
  ajustesPorFase?: Partial<Record<FaseHeladaFenologica, number>>;
  fuente?: string;
  observaciones?: string;
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
  sensibilidadHelada?: ISensibilidadHelada;
  observaciones?: string;
}

type OmitirCreate = "_id";
export interface ICreateSemilla extends Omit<Partial<ISemilla>, OmitirCreate> {}

type OmitirUpdate = "_id";
export interface IUpdateSemilla extends Omit<Partial<ISemilla>, OmitirUpdate> {}
