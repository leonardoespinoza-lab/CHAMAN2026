import { IDistribuidor } from './distribuidor';
import { IEstablecimiento } from './establecimiento';
import { IProductor } from './productor';
import { IQuimica } from './quimica';
import { IGeoJSONPoint } from '../compartidos';
import { IArchivado } from '../compartidos/archivado';

export type NivelPermiso =
  | 'Admin'
  | 'Tenant'
  | 'Quimica'
  | 'Distribuidor'
  | 'Asesor'
  | 'Productor'
  | 'Establecimiento';
export type Rol = 'Admin' | 'Lectura' | 'Escritura';

export type ModuloPermiso =
  | 'Enfermedades'
  | 'Riego'
  | 'HuellaHidrica'
  | 'NDVI'
  | 'Clima'
  | 'EtapasFenologicas'
  | 'Sensores'
  | 'Camaras'
  | 'Malezas'
  | 'FrioTermica'
  | 'Fertilizacion'
  | 'Fumigacion'
  | 'Certificados'
  | 'RegistroFotografico'
  | 'Visitas';

export type IModulosPermiso = Partial<Record<ModuloPermiso, boolean>>;

export interface IPermiso {
  nivel: NivelPermiso;
  rol: Rol;
  /** Frontera organizacional canonica. Se deriva de la sesion. */
  idTenant?: string;
  /** Identidad canonica del asesor. El backend la deriva del usuario autenticado. */
  idAsesor?: string;
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  /** Productores gestionados por el Asesor. El backend lo deriva en cada solicitud. */
  idProductores?: string[];
  idEstablecimiento?: string;
  /** Asignaciones administrativas adicionales del Asesor. Puede comenzar vacio. */
  idEstablecimientos?: string[];
  /** Restriccion opcional de lotes. Vacio significa todos los lotes de los establecimientos asignados. */
  idLotes?: string[];
  modulos?: IModulosPermiso;
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

export interface IDatosProfesionales {
  profesion?: string;
  especialidad?: string;
  matricula?: string;
  consejoProfesional?: string;
  /** PNG/JPEG/WebP validado, limitado y persistido como data URL. */
  foto?: string;
}

export interface IUbicacionProfesional {
  direccion?: string;
  geojson?: IGeoJSONPoint;
  /** Radio operativo declarativo para visualizar la zona atendida. */
  radioInfluenciaKm?: number;
}

export interface IUsuario extends IArchivado {
  _id?: string;
  activo?: boolean;
  fechaCreacion?: string;
  username?: string;
  hash?: string;
  permisos?: IPermiso[];
  email?: string;
  datosPersonales?: IDatosPersonales;
  datosProfesionales?: IDatosProfesionales;
  ubicacionProfesional?: IUbicacionProfesional;
  creadoPorUsuario?: string;
}

export interface IMetricasAdministrativasAsesor {
  productores: number;
  establecimientos: number;
  lotes: number;
  hectareas: number;
  usuariosGestionados: number;
}

/** Vista administrativa derivada del usuario Asesor y de su alcance real. */
export interface IResumenAdministrativoAsesor {
  id: string;
  username?: string;
  nombre: string;
  email?: string;
  telefono?: string;
  activo: boolean;
  archivado?: boolean;
  fechaArchivado?: string;
  archivadoPor?: string;
  fechaCreacion?: string;
  profesion?: string;
  especialidad?: string;
  matricula?: string;
  consejoProfesional?: string;
  direccion?: string;
  geojson?: IGeoJSONPoint;
  radioInfluenciaKm?: number;
  perfilCompleto: boolean;
  metricas: IMetricasAdministrativasAsesor;
}

export interface IResumenRedAsesores {
  actualizadoEn: string;
  totales: {
    asesores: number;
    activos: number;
    archivados?: number;
    perfilesCompletos: number;
    geolocalizados: number;
    productores: number;
    establecimientos: number;
    lotes: number;
    hectareas: number;
    usuariosGestionados: number;
  };
  asesores: IResumenAdministrativoAsesor[];
}

export interface IEstablecimientoAuditoriaAsesor {
  id: string;
  nombre: string;
  productor?: string;
  origen: 'Propio' | 'Asignado';
  lotes: number;
  hectareas: number;
  usuariosGestionados: number;
}

export interface ILoteAuditoriaAsesor {
  id: string;
  nombre: string;
  idEstablecimiento: string;
  establecimiento: string;
  hectareas: number;
}

export interface IUsuarioAuditoriaAsesor {
  id: string;
  username?: string;
  nombre: string;
  email?: string;
  activo: boolean;
  rol: Rol;
  nivel: 'Productor' | 'Establecimiento';
  idProductor?: string;
  productor?: string;
  idEstablecimiento?: string;
  establecimiento?: string;
}

export interface IProductorAuditoriaAsesor {
  id: string;
  nombre: string;
  establecimientos: number;
  lotes: number;
  hectareas: number;
  usuariosGestionados: number;
}

/** Ficha de solo lectura para auditar el perfil y alcance real de un asesor. */
export interface IDetalleAuditoriaAsesor {
  actualizadoEn: string;
  asesor: IResumenAdministrativoAsesor & { foto?: string };
  productores: IProductorAuditoriaAsesor[];
  establecimientos: IEstablecimientoAuditoriaAsesor[];
  lotes: ILoteAuditoriaAsesor[];
  usuarios: IUsuarioAuditoriaAsesor[];
}

export type FuenteUbicacionRed = 'Cargada' | 'Derivada' | 'Pendiente';

export interface IMetricasRedComercial {
  productores?: number;
  establecimientos: number;
  lotes: number;
  hectareas: number;
  usuarios: number;
}

export interface IDistribuidorRedComercial {
  id: string;
  nombre: string;
  idQuimica?: string;
  direccion?: string;
  geojson?: IGeoJSONPoint;
  radioInfluenciaKm?: number;
  fuenteUbicacion: FuenteUbicacionRed;
  metricas: IMetricasRedComercial;
}

export interface IProductorRedComercial {
  id: string;
  nombre: string;
  idQuimica?: string;
  idDistribuidor?: string;
  distribuidor?: string;
  direccion?: string;
  geojson?: IGeoJSONPoint;
  radioInfluenciaKm?: number;
  fuenteUbicacion: FuenteUbicacionRed;
  metricas: IMetricasRedComercial;
}

export interface IEstablecimientoRedComercial {
  id: string;
  nombre: string;
  idDistribuidor?: string;
  idProductor?: string;
  productor?: string;
  geojson?: IGeoJSONPoint;
  lotes: number;
  hectareas: number;
  usuarios: number;
}

/** Resumen territorial canonico de la jerarquia distribuidor-productor-establecimiento-lote. */
export interface IResumenRedComercial {
  actualizadoEn: string;
  totales: {
    distribuidores: number;
    productores: number;
    establecimientos: number;
    lotes: number;
    hectareas: number;
    usuarios: number;
  };
  distribuidores: IDistribuidorRedComercial[];
  productores: IProductorRedComercial[];
  establecimientos: IEstablecimientoRedComercial[];
}

type OmitirCreate = '_id';
export interface ICreateUsuario extends Omit<Partial<IUsuario>, OmitirCreate> {
  password?: string;
}

type OmitirUpdate = '_id';
export interface IUpdateUsuario extends Omit<Partial<IUsuario>, OmitirUpdate> {
  password?: string;
}
