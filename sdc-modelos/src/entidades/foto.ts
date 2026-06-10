import { ILote } from "./lote"; // Adjust the path as necessary

export interface IFoto {
  _id?: string;
  fechaCreacion?: string;
  url?: string; // URL de la foto
  idLote?: string; // ID del lote al que pertenece la foto
  // Populate
  lote?: ILote; // Lote al que pertenece la foto, para populado
}

type OmitirCreate = "_id" | "lote";
export interface ICreateFoto extends Omit<Partial<IFoto>, OmitirCreate> {}

type OmitirUpdate = "_id" | "lote";
export interface IUpdateFoto extends Omit<Partial<IFoto>, OmitirUpdate> {}
