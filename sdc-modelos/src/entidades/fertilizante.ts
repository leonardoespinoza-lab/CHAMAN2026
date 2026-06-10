export interface IFertilizante {
  _id?: string;
  nombre?: string;
  porcentajeN?: number;
  porcentajeP?: number;
}

type OmitirCreate = "_id";
export interface ICreateFertilizante
  extends Omit<Partial<IFertilizante>, OmitirCreate> {}

type OmitirUpdate = "_id";
export interface IUpdateFertilizante
  extends Omit<Partial<IFertilizante>, OmitirUpdate> {}
