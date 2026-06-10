import { IEmpresa } from "./empresa";
import { IPrincipioActivo } from "./principio-activo";

export interface IAgroquimico {
  _id?: string;
  nombre?: string;
  idEmpresa?: string;
  idPrincipioActivo?: string;
  concentracion?: number;
  koc?: number;
  persistencia?: number;
  volatilidad?: string;
  segmento?: string;
  subsegmentos?: string[];
  fuente?: string;
  //
  empresa?: IEmpresa;
  principioActivo?: IPrincipioActivo;
}

type OmitirCreate = "_id" | "empresa" | "principioActivo";
export interface ICreateAgroquimico
  extends Omit<Partial<IAgroquimico>, OmitirCreate> {}

type OmitirUpdate = "_id" | "empresa" | "principioActivo";
export interface IUpdateAgroquimico
  extends Omit<Partial<IAgroquimico>, OmitirUpdate> {}
