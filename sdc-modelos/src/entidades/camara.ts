import { IFoto } from "./foto";
import { ILote } from "./lote";

export type TOrigenCamara = "hik-connect" | "ftp";
export type TEstadoCapturaCamara =
  | "pendiente"
  | "ok"
  | "error"
  | "fuera_de_ventana";

export interface ICapturaAutomaticaCamara {
  habilitada?: boolean;
  intervaloMinutos?: number;
  reintentoMinutos?: number;
  horaInicio?: string;
  horaFin?: string;
  proximoIntento?: string;
  ultimoIntento?: string;
  ultimoExito?: string;
  ultimoError?: string;
  estado?: TEstadoCapturaCamara;
}

export interface ICamara {
  _id?: string;
  fechaCreacion?: string;
  serialCamara: string;
  nombre?: string;
  modelo?: string;
  categoria?: string;
  canal?: number;
  online?: boolean;
  area?: string;
  fuente?: TOrigenCamara;
  fechaSincronizacion?: string;
  fechaUltimaComunicacion?: string;
  capturaAutomatica?: ICapturaAutomaticaCamara;
  lotes?: ILote[];
  ultimaFoto?: IFoto;
  totalFotos?: number;
  raw?: Record<string, unknown>;
}

export interface IAsignarCamaraLotes {
  idsLote: string[];
  reemplazar?: boolean;
}

type OmitirCreateCamara = "_id" | "fechaCreacion" | "lotes" | "ultimaFoto" | "totalFotos";
export interface ICreateCamara extends Omit<Partial<ICamara>, OmitirCreateCamara> {}

type OmitirUpdateCamara = "_id" | "fechaCreacion" | "lotes" | "ultimaFoto" | "totalFotos";
export interface IUpdateCamara extends Omit<Partial<ICamara>, OmitirUpdateCamara> {}
