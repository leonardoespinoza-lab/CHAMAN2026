import { IGeoJSONPoint, IIntegracion, IUbicacion } from '../compartidos';
import { ICreateLicencia } from './licencia';
import { IQuimica } from './quimica';
import { IArchivado } from '../compartidos/archivado';

export interface IDistribuidor extends IArchivado {
  _id?: string;
  idQuimica?: string;
  nombre?: string;
  logo?: string;
  fechaCreacion?: string;
  integraciones?: IIntegracion[];
  geojson?: IGeoJSONPoint;
  direccion?: string;
  radioInfluenciaKm?: number;
  // Populate
  quimica?: IQuimica;
}

type OmitirCreate = '_id' | 'quimica';
export interface ICreateDistribuidor
  extends Omit<Partial<IDistribuidor>, OmitirCreate> {
  licencia?: ICreateLicencia;
  expiracion?: number; // CANTIDAD DE DIAS
}

type OmitirUpdate = '_id' | 'quimica';
export interface IUpdateDistribuidor
  extends Omit<Partial<IDistribuidor>, OmitirUpdate> {
  licencia?: ICreateLicencia;
  expiracion?: number; // CANTIDAD DE DIAS
}
