export interface ILicencia {
  _id?: string;
  fechaCreacion?: string;
  nombre?: string; // "Free" | "Pro" | "Enterprise";
  /** Identificador estable para futuras integraciones de facturacion. */
  codigo?: string;
  /** Los cambios comerciales se versionan sin reutilizar el identificador externo. */
  version?: number;
  estado?: 'borrador' | 'activo' | 'archivado';
  modeloFacturacion?: 'sin_cargo' | 'suscripcion' | 'por_uso' | 'hibrido';
  /** Legacy queda informativo para no bloquear clientes existentes. */
  modoLimite?: 'informativo' | 'bloqueante';
  origen?: 'manual' | 'automatico' | 'sistema';
  motivoCreacion?: string;
  maxUsuarios?: number;
  // Aplica a quimica
  maxDistribuidores?: number;
  /** @deprecated Compatibilidad con documentos anteriores. */
  maxdDistribuidores?: number;
  // Aplica a distribuidor
  maxProductores?: number;
  // Aplica a productor
  maxEstablecimientos?: number;
  maxLotes?: number;
  maxHectareas?: number;
  /** @deprecated Compatibilidad con documentos anteriores. */
  maxdHectareas?: number;
  //
  modulos?: {
    Enfermedades?: boolean;
    Riego?: boolean;
    'Huella Hídrica'?: boolean;
    NDVI?: boolean;
    Clima?: boolean;
    'Etapas Fenológicas'?: boolean;
  };

  default?: boolean; // Indica si es la licencia por defecto y solo puede haber una. (La gratis)
}

type OmitirCreate = '_id';
export interface ICreateLicencia
  extends Omit<Partial<ILicencia>, OmitirCreate> {}

type OmitirUpdate = '_id' | 'default';
export interface IUpdateLicencia
  extends Omit<Partial<ILicencia>, OmitirUpdate> {}
