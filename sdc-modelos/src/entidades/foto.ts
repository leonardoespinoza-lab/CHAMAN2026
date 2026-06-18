import { ILote } from "./lote"; // Adjust the path as necessary

export type TOrigenFoto = "ftp" | "hik-connect";

export interface IFoto {
  _id?: string;
  fechaCreacion?: string;
  url?: string; // URL de la foto
  idLote?: string; // ID del lote al que pertenece la foto
  fuente?: TOrigenFoto;
  serialCamara?: string;
  canalCamara?: number;
  nombreOriginal?: string;
  metadata?: Record<string, unknown>;
  // Populate
  lote?: ILote; // Lote al que pertenece la foto, para populado
}

type OmitirCreate = "_id" | "lote";
export interface ICreateFoto extends Omit<Partial<IFoto>, OmitirCreate> {}

type OmitirUpdate = "_id" | "lote";
export interface IUpdateFoto extends Omit<Partial<IFoto>, OmitirUpdate> {}
