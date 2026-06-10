export interface IEmpresa {
  _id?: string;
  nombre?: string;
  logo?: string;
  color?: string;
}

type OmitirCreate = "_id";
export interface ICreateEmpresa extends Omit<Partial<IEmpresa>, OmitirCreate> {}

type OmitirUpdate = "_id";
export interface IUpdateEmpresa extends Omit<Partial<IEmpresa>, OmitirUpdate> {}
