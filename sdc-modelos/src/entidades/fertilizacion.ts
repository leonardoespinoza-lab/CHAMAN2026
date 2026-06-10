import { IDistribuidor } from "./distribuidor";
import { IEstablecimiento } from "./establecimiento";
import { IFertilizante } from "./fertilizante";
import { ILote } from "./lote";
import { IProductor } from "./productor";
import { IQuimica } from "./quimica";
import { ISiembra } from "./siembra";

export interface IFertilizacion {
  _id?: string;
  // Tenant
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  idEstablecimiento?: string;
  // Datos Autogenerados
  fechaCreacion?: string;
  // Info de Fumigación
  fechaFertilizacion?: string;
  idLote?: string;
  idFertilizante?: string;
  dosisKgHa?: number;

  // Populate
  lote?: ILote;
  fertilizante?: IFertilizante;
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
}

type OmitirCreate =
  | "_id"
  | "siembra"
  | "fertilizante"
  | "quimica"
  | "distribuidor"
  | "productor"
  | "establecimiento";
export interface ICreateFertilizacion
  extends Omit<Partial<IFertilizacion>, OmitirCreate> {}

type OmitirUpdate =
  | "_id"
  | "siembra"
  | "agroquimico"
  | "quimica"
  | "distribuidor"
  | "productor"
  | "establecimiento";
export interface IUpdateFertilizacion
  extends Omit<Partial<IFertilizacion>, OmitirUpdate> {}
