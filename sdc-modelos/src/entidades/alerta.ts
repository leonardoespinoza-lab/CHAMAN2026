import { IDistribuidor } from "./distribuidor";
import { IEstablecimiento } from "./establecimiento";
import { IProductor } from "./productor";
import { IQuimica } from "./quimica";
import { ISiembra } from "./siembra";
import { IUsuario } from "./usuario";

export type EstadoAlerta = "Nueva" | "Tratada" | "Postergada" | "Finalizada";
export const ESTADOS_ALERTA = ["Nueva", "Tratada", "Postergada", "Finalizada"];

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
  idSiembra?: string;
  // Datos Autogenerados
  fecha?: string;
  // Estados de la alerta
  estados?: IEstadoAlerta[];
  estadoActual?: EstadoAlerta;
  activa?: boolean;
  // Datos especificos de la alerta de acuerdo al tipo de dispositivo
  descripcion?: string;
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
