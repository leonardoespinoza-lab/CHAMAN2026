import { IDistribuidor } from "./distribuidor";
import { IEstablecimiento } from "./establecimiento";
import { IProductor } from "./productor";
import { IQuimica } from "./quimica";
import { ISiembra } from "./siembra";
import { IUsuario } from "./usuario";

export type EstadoAlerta = "Nueva" | "Tratada" | "Postergada" | "Finalizada";
export const ESTADOS_ALERTA = ["Nueva", "Tratada", "Postergada", "Finalizada"];

export type CategoriaAlerta =
  | "sanitaria"
  | "malezas"
  | "agroclimatica"
  | "riego"
  | "sensor"
  | "satelital"
  | "operativa"
  | "sistema";
export type SeveridadAlerta = "baja" | "media" | "alta" | "critica";
export type CanalAlerta = "app" | "push" | "email" | "telegram" | "whatsapp";
export type EstadoCanalAlerta =
  "pendiente" | "enviada" | "fallida" | "omitida" | "no_configurado";

export interface ICanalAlerta {
  canal?: CanalAlerta;
  habilitado?: boolean;
  estado?: EstadoCanalAlerta;
  fecha?: string;
  detalle?: string;
}

export interface ICalidadDatosAlerta {
  nivel?: "alta" | "media" | "baja" | "sin_datos" | string;
  score?: number;
  fuente?: string;
  detalle?: string;
}

export interface IEstadoAlerta {
  fecha?: string;
  idUsuario?: string;
  estado?: EstadoAlerta;
  comentario?: string;
  // Virtual
  usuario?: IUsuario;
}

export interface IAlerta {
  _id?: string;
  // Tentant
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  idEstablecimiento?: string;
  idLote?: string;
  idSiembra?: string;
  // Datos Autogenerados
  fecha?: string;
  // Estados de la alerta
  estados?: IEstadoAlerta[];
  estadoActual?: EstadoAlerta;
  activa?: boolean;
  // Datos especificos de la alerta de acuerdo al tipo de dispositivo
  descripcion?: string;
  titulo?: string;
  tipo?: string;
  categoria?: CategoriaAlerta;
  severidad?: SeveridadAlerta;
  prioridad?: number;
  origen?: string;
  motor?: string;
  versionMotor?: string;
  eventKey?: string;
  dedupeKey?: string;
  lectura?: string;
  recomendacion?: string;
  accionSugerida?: string;
  calidadDatos?: ICalidadDatosAlerta;
  canales?: ICanalAlerta[];
  fechaUltimoEvento?: string;
  fechaVencimiento?: string;
  reportes?: Record<string, any>[];
  // Virtuals
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
  siembra?: ISiembra;
}

type OmitirCreate =
  | "_id"
  | "quimica"
  | "distribuidor"
  | "productor"
  | "establecimiento"
  | "siembra";
export interface ICreateAlerta extends Omit<Partial<IAlerta>, OmitirCreate> {}

type OmitirUpdate =
  | "_id"
  | "quimica"
  | "distribuidor"
  | "productor"
  | "establecimiento"
  | "siembra";
export interface IUpdateAlerta extends Omit<Partial<IAlerta>, OmitirUpdate> {}

/**
 * Comando interno entre los motores y sdc-datos. La consolidacion se ejecuta
 * en MongoDB; no debe implementarse como un GET seguido de POST/PUT porque dos
 * replicas podrian abrir la misma alerta activa.
 */
export interface IRegistrarEventoAlerta {
  alerta: ICreateAlerta;
  reporte: Record<string, any>;
  eventKey: string;
}

export interface IResultadoRegistroEventoAlerta {
  alerta?: IAlerta;
  creada: boolean;
  duplicada: boolean;
}

export interface IFinalizarEventoAlerta {
  idSiembra: string;
  descripcion: string;
  comentario: string;
  dedupeKey?: string;
  tituloLegado?: string;
  fecha: string;
}
