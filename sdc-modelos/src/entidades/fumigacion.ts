import { IAgroquimico } from "./agroquimico";
import { IDistribuidor } from "./distribuidor";
import { IEstablecimiento } from "./establecimiento";
import { IPrincipioActivo } from "./principio-activo";
import { IProductor } from "./productor";
import { IQuimica } from "./quimica";
import { ISiembra } from "./siembra";

export interface ILineaFumigacion {
  idAgroquimico?: string;
  idPrincipioActivo?: string;
  concentracion?: number;
  dosisLtHa?: number;
  duracion?: number;
  /** Copias historicas del producto al momento de registrar la aplicacion. */
  agroquimico?: IAgroquimico;
  principioActivo?: IPrincipioActivo;
}

export interface IFumigacion {
  _id?: string;
  // Tenant
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  idEstablecimiento?: string;
  idLote?: string;
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
  /** Productos usados dentro de la misma labor de pulverizacion. */
  lineas?: ILineaFumigacion[];

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

export function getLineasFumigacion(
  aplicacion?: Partial<IFumigacion>,
): ILineaFumigacion[] {
  if (Array.isArray(aplicacion?.lineas) && aplicacion.lineas.length) {
    return aplicacion.lineas;
  }
  if (
    !aplicacion?.idAgroquimico &&
    !aplicacion?.idPrincipioActivo &&
    aplicacion?.dosisLtHa === undefined
  ) {
    return [];
  }
  return [
    {
      idAgroquimico: aplicacion.idAgroquimico,
      idPrincipioActivo: aplicacion.idPrincipioActivo,
      concentracion: aplicacion.concentracion,
      dosisLtHa: aplicacion.dosisLtHa,
      duracion: aplicacion.duracion,
      agroquimico: aplicacion.agroquimico,
      principioActivo: aplicacion.principioActivo,
    },
  ];
}
