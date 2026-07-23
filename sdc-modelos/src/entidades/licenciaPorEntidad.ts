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
  fechaInicio?: string;
  fechaActualizacion?: string;
  tipoEntidad?: TipoEntidadLicencia;
  estado?: EstadoAsignacionLicencia;
  origen?: 'manual' | 'heredada' | 'facturacion' | 'sistema';
  motivoCambio?: string;
  creadoPorUsuario?: string;
  idAsignacionAnterior?: string;
  referenciaFacturacion?: {
    proveedor?: string;
    idClienteExterno?: string;
    idSuscripcionExterna?: string;
  };
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

export type TipoEntidadLicencia =
  | 'Quimica'
  | 'Distribuidor'
  | 'Productor'
  | 'Establecimiento'
  | 'Asesor';

export type EstadoAsignacionLicencia =
  | 'programada'
  | 'activa'
  | 'gracia'
  | 'suspendida'
  | 'cancelada'
  | 'vencida'
  | 'reemplazada';

export interface IAsignarLicenciaEntidad {
  idLicencia: string;
  tipoEntidad: TipoEntidadLicencia;
  fechaInicio?: string;
  fechaExpiracion?: string;
  motivoCambio?: string;
}

export interface IEstadoLicenciaEntidad {
  tipoEntidad: TipoEntidadLicencia;
  idEntidad: string;
  licencia?: ILicencia;
  asignacion?: ILicenciaPorEntidad;
  origenEfectivo: 'directa' | 'heredada' | 'default' | 'sin_configurar';
  tipoEntidadFuente?: TipoEntidadLicencia;
  idEntidadFuente?: string;
  diasRestantes?: number;
  advertencias: string[];
  historial?: ILicenciaPorEntidad[];
  uso?: IUsoLicenciaEntidad;
}

export interface IMetricaUsoLicencia {
  actual: number;
  limite?: number;
  porcentaje?: number;
  excedido: boolean;
}

export interface IUsoLicenciaEntidad {
  medidoEn: string;
  usuarios: IMetricaUsoLicencia;
  distribuidores: IMetricaUsoLicencia;
  productores: IMetricaUsoLicencia;
  establecimientos: IMetricaUsoLicencia;
  lotes: IMetricaUsoLicencia;
  hectareas: IMetricaUsoLicencia;
}
