import { IDistribuidor } from './distribuidor';
import { ILicencia } from './licencia';
import { IProductor } from './productor';
import { IQuimica } from './quimica';

export interface ILicenciaPorEntidad {
  _id?: string;
  idLicencia?: string; // ID de la licencia
  idEntidad?: string; // puede ser ID de Química, Distribuidor o Productor
  fechaCreacion?: string; // Fecha de creación de la licencia
  fechaExpiracion?: string; // Fecha de expiración de la licencia
  // Virtuals
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  licencia?: ILicencia;
}

type OmitirCreate =
  | '_id'
  | 'quimica'
  | 'distribuidor'
  | 'productor'
  | 'licencia';
export interface ICreateLicenciaPorEntidad
  extends Omit<Partial<ILicenciaPorEntidad>, OmitirCreate> {}

type OmitirUpdate =
  | '_id'
  | 'quimica'
  | 'distribuidor'
  | 'productor'
  | 'licencia';
export interface IUpdateLicenciaPorEntidad
  extends Omit<Partial<ILicenciaPorEntidad>, OmitirUpdate> {}
