import { IArchivado } from "../compartidos/archivado";
import { ILote } from "./lote"; // Adjust the path as necessary

export type TOrigenFoto = "ftp" | "hik-connect" | "campo";
export type TEstadoAnalisisFoto = "pendiente" | "lista" | "procesando" | "analizada" | "error";

export interface IFoto extends IArchivado {
  _id?: string;
  fechaCreacion?: string;
  fechaCaptura?: string;
  url?: string; // URL de la foto
  idLote?: string; // ID del lote al que pertenece la foto
  idVisita?: string;
  fuente?: TOrigenFoto;
  serialCamara?: string;
  canalCamara?: number;
  nombreOriginal?: string;
  mimeType?: string;
  sizeBytes?: number;
  titulo?: string;
  descripcion?: string;
  etiquetas?: string[];
  latitud?: number;
  longitud?: number;
  precisionMetros?: number;
  creadaPorUsuario?: string;
  creadaPorNombre?: string;
  estadoIA?: TEstadoAnalisisFoto;
  metadata?: Record<string, unknown>;
  // Populate
  lote?: ILote; // Lote al que pertenece la foto, para populado
}

type OmitirCreate = "_id" | "lote" | "fechaCreacion";
export interface ICreateFoto extends Omit<Partial<IFoto>, OmitirCreate> {}

type OmitirUpdate = "_id" | "lote";
export interface IUpdateFoto extends Omit<Partial<IFoto>, OmitirUpdate> {}
