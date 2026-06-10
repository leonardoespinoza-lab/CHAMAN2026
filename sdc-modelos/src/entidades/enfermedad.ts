export interface IEnfermedad {
  _id?: string;
  nombre?: string;
  cultivo?: string;
  etapas?: number[];
  formula?: string;
  tempMin?: number;
  tempMax?: number;
  rocioMin?: number;
  rocioMax?: number;
  latenciaMin?: number;
  latenciaMax?: number;
}

type OmitirCreate = "_id";
export interface ICreateEnfermedad
  extends Omit<Partial<IEnfermedad>, OmitirCreate> {}

type OmitirUpdate = "_id";
export interface IUpdateEnfermedad
  extends Omit<Partial<IEnfermedad>, OmitirUpdate> {}
