import { IUbicacion } from "../compartidos/ubicacion";
import { IProvincia } from "./provincia";

export interface IDepartamento {
  _id?: string;
  nombre?: string;
  ubicacion?: IUbicacion;
  idProvincia?: string;
  // Populate
  provincia?: IProvincia;
}

type OmitirCreate = "_id" | "provincia";
export interface ICreateDepartamento
  extends Omit<Partial<IDepartamento>, OmitirCreate> {}

type OmitirUpdate = "_id" | "provincia";
export interface IUpdateDepartamento
  extends Omit<Partial<IDepartamento>, OmitirUpdate> {}
