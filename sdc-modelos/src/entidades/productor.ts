import { IGeoJSONPoint, IIntegracion } from '../compartidos';
import { IDistribuidor } from './distribuidor';
import { ICreateLicencia } from './licencia';
import { IQuimica } from './quimica';
import { IArchivado } from '../compartidos/archivado';

export interface IProductor extends IArchivado {
  _id?: string;
  /** Tenant propietario. Ausente solo en datos legacy previos a multi-tenant. */
  idTenant?: string;
  /** Asesor propietario de la relacion comercial con este productor. */
  idAsesorPropietario?: string;
  idQuimica?: string;
  idDistribuidor?: string;
  gratis?: boolean;
  nombre?: string;
  /** Datos fiscales opcionales de la persona o empresa productora. */
  razonSocial?: string;
  cuit?: string;
  condicionIva?: string;
  emailFiscal?: string;
  telefonoFiscal?: string;
  direccionFiscal?: string;
  logo?: string;
  fechaCreacion?: string;
  integraciones?: IIntegracion[];
  /** Domicilio operativo del productor para representarlo en la red territorial. */
  direccion?: string;
  geojson?: IGeoJSONPoint;
  radioInfluenciaKm?: number;
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
