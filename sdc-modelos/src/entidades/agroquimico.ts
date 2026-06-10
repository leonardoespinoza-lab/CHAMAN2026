import { IEmpresa } from "./empresa";

export interface IAgroquimico {
  _id?: string;
  nombre?: string;
  idEmpresa?: string;
  segmento?: string;
  subsegmentos?: string[];
  //
  empresa?: IEmpresa;
}

type OmitirCreate = "_id" | "empresa";
export interface ICreateAgroquimico
  extends Omit<Partial<IAgroquimico>, OmitirCreate> {}

type OmitirUpdate = "_id" | "empresa";
export interface IUpdateAgroquimico
  extends Omit<Partial<IAgroquimico>, OmitirUpdate> {}
