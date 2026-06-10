export interface ILicencia {
  _id?: string;
  nombre?: string; // "Free" | "Pro" | "Enterprise";
  maxUsuarios?: number;
  // Aplica a quimica
  maxdDistribuidores?: number;
  // Aplica a distribuidor
  maxProductores?: number;
  // Aplica a productor
  maxEstablecimientos?: number;
  maxLotes?: number;
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
