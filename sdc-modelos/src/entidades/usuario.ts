import { IDistribuidor } from './distribuidor';
import { IEstablecimiento } from './establecimiento';
import { IProductor } from './productor';
import { IQuimica } from './quimica';

export type NivelPermiso =
  | 'Admin'
  | 'Quimica'
  | 'Distribuidor'
  | 'Productor'
  | 'Establecimiento';
export type Rol = 'Admin' | 'Lectura' | 'Escritura';

export interface IPermiso {
  nivel: NivelPermiso;
  rol: Rol;
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  idEstablecimiento?: string;
  // Populate
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
}

export interface IDatosPersonales {
  nombre?: string;
  email?: string;
  [key: string]: string | undefined;
}

export interface IUsuario {
  _id?: string;
  activo?: boolean;
  fechaCreacion?: string;
  username?: string;
  hash?: string;
  permisos?: IPermiso[];
  email?: string;
  datosPersonales?: IDatosPersonales;
}

type OmitirCreate = '_id';
export interface ICreateUsuario extends Omit<Partial<IUsuario>, OmitirCreate> {
  password?: string;
}

type OmitirUpdate = '_id';
export interface IUpdateUsuario extends Omit<Partial<IUsuario>, OmitirUpdate> {
  password?: string;
}
