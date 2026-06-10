import { IUbicacion } from "../compartidos/ubicacion";

export interface IProvincia {
  _id?: string;
  nombre?: string;
  ubicacion?: IUbicacion;
}

type OmitirCreate = "_id";
export interface ICreateProvincia
  extends Omit<Partial<IProvincia>, OmitirCreate> {}

type OmitirUpdate = "_id";
export interface IUpdateProvincia
  extends Omit<Partial<IProvincia>, OmitirUpdate> {}
