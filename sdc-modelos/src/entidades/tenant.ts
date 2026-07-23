import { IArchivado } from '../compartidos/archivado';
import { IModulosPermiso } from './usuario';

export type EstadoTenant =
  | 'borrador'
  | 'activo'
  | 'suspendido'
  | 'archivado';

export type TipoEntidadRaizTenant = 'Quimica' | 'Distribuidor' | 'Asesor';

export interface IBrandingTenant {
  nombreAplicacion?: string;
  logo?: string;
  icono?: string;
  colorPrimario?: string;
  colorSecundario?: string;
  colorFondo?: string;
  mostrarMarcaChaman?: boolean;
}

export interface ICapacidadesTenant {
  administrarCompanias?: boolean;
  administrarDistribuidores?: boolean;
  administrarAsesores?: boolean;
  administrarProductores?: boolean;
  gestionTerritorialAsesor?: boolean;
}

export interface ILimitesTenant {
  usuarios?: number;
  companias?: number;
  distribuidores?: number;
  asesores?: number;
  productores?: number;
  establecimientos?: number;
  lotes?: number;
  hectareas?: number;
}

export interface IEntidadRaizTenant {
  tipo?: TipoEntidadRaizTenant;
  idEntidad?: string;
  nombre?: string;
}

export interface IAdministradorInicialTenant {
  username?: string;
  password?: string;
  nombre?: string;
  email?: string;
}

export interface ITenant extends IArchivado {
  _id?: string;
  slug?: string;
  nombre?: string;
  razonSocial?: string;
  cuit?: string;
  estado?: EstadoTenant;
  dominios?: string[];
  branding?: IBrandingTenant;
  modulos?: IModulosPermiso;
  capacidades?: ICapacidadesTenant;
  limites?: ILimitesTenant;
  entidadRaiz?: IEntidadRaizTenant;
  idUsuarioAdmin?: string;
  provisionado?: boolean;
  ultimoErrorProvisionamiento?: string;
  fechaCreacion?: string;
  fechaActualizacion?: string;
  creadoPorUsuario?: string;
}

type OmitirCreateTenant =
  | '_id'
  | 'fechaCreacion'
  | 'fechaActualizacion'
  | 'idUsuarioAdmin'
  | 'provisionado'
  | 'ultimoErrorProvisionamiento';

export interface ICreateTenant
  extends Omit<Partial<ITenant>, OmitirCreateTenant> {
  administrador?: IAdministradorInicialTenant;
}

type OmitirUpdateTenant = '_id' | 'fechaCreacion' | 'creadoPorUsuario';
export interface IUpdateTenant
  extends Omit<Partial<ITenant>, OmitirUpdateTenant> {}
