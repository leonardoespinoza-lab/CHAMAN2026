import { IAgroquimico } from "./agroquimico";
import { IDistribuidor } from "./distribuidor";
import { IEstablecimiento } from "./establecimiento";
import { IPrincipioActivo } from "./principio-activo";
import { IProductor } from "./productor";
import { IQuimica } from "./quimica";
import { ISiembra } from "./siembra";

export interface IFumigacion {
  _id?: string;
  // Tenant
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  idEstablecimiento?: string;
  // Datos Autogenerados
  fechaCreacion?: string;
  // Info de Fumigación
  fechaFumigacion?: string;
  idSiembra?: string;
  idAgroquimico?: string;
  duracion?: number; // 15 días
  idPrincipioActivo?: string;
  concentracion?: number;
  dosisLtHa?: number;

  // Populate
  siembra?: ISiembra;
  agroquimico?: IAgroquimico;
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
  principioActivo?: IPrincipioActivo;
}

type OmitirCreate =
  | "_id"
  | "siembra"
  | "agroquimico"
  | "quimica"
  | "distribuidor"
  | "productor"
  | "establecimiento"
  | "principioActivo";
export interface ICreateFumigacion
  extends Omit<Partial<IFumigacion>, OmitirCreate> {}

type OmitirUpdate =
  | "_id"
  | "siembra"
  | "agroquimico"
  | "quimica"
  | "distribuidor"
  | "productor"
  | "establecimiento"
  | "principioActivo";
export interface IUpdateFumigacion
  extends Omit<Partial<IFumigacion>, OmitirUpdate> {}
