import { IIntegracion } from '../compartidos';
import { IEmpresa } from './empresa';
import { ICreateLicencia } from './licencia';
import { IArchivado } from '../compartidos/archivado';

export interface IQuimica extends IArchivado {
  _id?: string;
  nombre?: string;
  razonSocial?: string;
  cuit?: string;
  logo?: string;
  email?: string;
  telefono?: string;
  web?: string;
  direccionFiscal?: string;
  observaciones?: string;
  fechaCreacion?: string;
  idEmpresas?: string[];
  integraciones?: IIntegracion[];
  //
  empresas?: IEmpresa[];
}

type OmitirCreate = '_id' | 'empresas';
export interface ICreateQuimica extends Omit<Partial<IQuimica>, OmitirCreate> {
  licencia?: ICreateLicencia;
  expiracion?: number; // CANTIDAD DE DIAS
}

type OmitirUpdate = '_id' | 'empresas';
export interface IUpdateQuimica extends Omit<Partial<IQuimica>, OmitirUpdate> {
  licencia?: ICreateLicencia;
  expiracion?: number; // CANTIDAD DE DIAS
}
