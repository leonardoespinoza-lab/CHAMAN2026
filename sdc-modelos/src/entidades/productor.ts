import { IIntegracion } from '../compartidos';
import { IDistribuidor } from './distribuidor';
import { ICreateLicencia } from './licencia';
import { IQuimica } from './quimica';

export interface IProductor {
  _id?: string;
  idQuimica?: string;
  idDistribuidor?: string;
  gratis?: boolean;
  nombre?: string;
  logo?: string;
  fechaCreacion?: string;
  integraciones?: IIntegracion[];
  // Populate
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
}

type OmitirCreate = '_id' | 'quimica' | 'distribuidor';
export interface ICreateProductor
  extends Omit<Partial<IProductor>, OmitirCreate> {
  licencia?: ICreateLicencia;
  expiracion?: number; // CANTIDAD DE DIAS
}

type OmitirUpdate = '_id' | 'quimica' | 'distribuidor';
export interface IUpdateProductor
  extends Omit<Partial<IProductor>, OmitirUpdate> {
  licencia?: ICreateLicencia;
  expiracion?: number; // CANTIDAD DE DIAS
}
