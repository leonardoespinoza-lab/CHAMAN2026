import { IDistribuidor } from "./distribuidor";
import { IEstablecimiento } from "./establecimiento";
import { IFertilizante } from "./fertilizante";
import { ILote } from "./lote";
import { IProductor } from "./productor";
import { IQuimica } from "./quimica";
import { ISiembra } from "./siembra";

export interface ILineaFertilizacion {
  idFertilizante?: string;
  dosisKgHa?: number;
  /** Copia historica del insumo al momento de registrar la aplicacion. */
  fertilizante?: IFertilizante;
}

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
  /**
   * Productos aplicados en una misma labor. Los campos simples anteriores se
   * conservan con la primera linea para compatibilidad con registros y
   * consumidores legacy.
   */
  lineas?: ILineaFertilizacion[];

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

export function getLineasFertilizacion(
  aplicacion?: Partial<IFertilizacion>,
): ILineaFertilizacion[] {
  if (Array.isArray(aplicacion?.lineas) && aplicacion.lineas.length) {
    return aplicacion.lineas;
  }
  if (!aplicacion?.idFertilizante && aplicacion?.dosisKgHa === undefined) {
    return [];
  }
  return [
    {
      idFertilizante: aplicacion.idFertilizante,
      dosisKgHa: aplicacion.dosisKgHa,
      fertilizante: aplicacion.fertilizante,
    },
  ];
}
