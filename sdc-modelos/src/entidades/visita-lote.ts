import { IArchivado } from "../compartidos/archivado";

export type TEstadoVisitaLote = "programada" | "realizada" | "cancelada";
export type TTipoVisitaLote =
  | "recorrida_general"
  | "monitoreo_sanitario"
  | "fenologia"
  | "riego"
  | "nutricion"
  | "aplicacion"
  | "muestreo"
  | "cosecha"
  | "otro";

export type TActividadVisitaLote =
  | "fotografias"
  | "fenologia"
  | "enfermedades"
  | "malezas"
  | "plagas"
  | "riego"
  | "suelo"
  | "nutricion"
  | "aplicaciones"
  | "rendimiento"
  | "otro";

/** Bitacora auditable de una recorrida o visita tecnica realizada en un lote. */
export interface IVisitaLote extends IArchivado {
  _id?: string;
  idTenant?: string;
  idAsesorPropietario?: string;
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  idEstablecimiento?: string;
  idLote?: string;
  fechaVisita?: string;
  horaInicio?: string;
  horaFin?: string;
  titulo?: string;
  tipo?: TTipoVisitaLote;
  estado?: TEstadoVisitaLote;
  actividades?: TActividadVisitaLote[];
  participantes?: string[];
  observaciones?: string;
  hallazgos?: string;
  recomendaciones?: string;
  proximaVisita?: string;
  latitud?: number;
  longitud?: number;
  precisionMetros?: number;
  idsFotos?: string[];
  creadaPorUsuario?: string;
  creadaPorNombre?: string;
  fechaCreacion?: string;
  fechaActualizacion?: string;
  actualizadoPorUsuario?: string;
  actualizadoPorNombre?: string;
}

type OmitirCreate =
  | "_id"
  | "idTenant"
  | "idAsesorPropietario"
  | "idQuimica"
  | "idDistribuidor"
  | "idProductor"
  | "idEstablecimiento"
  | "idsFotos"
  | "fechaCreacion"
  | "fechaActualizacion"
  | "creadaPorUsuario"
  | "creadaPorNombre"
  | "actualizadoPorUsuario"
  | "actualizadoPorNombre";

export interface ICreateVisitaLote extends Omit<Partial<IVisitaLote>, OmitirCreate> {}

type OmitirUpdate =
  | "_id"
  | "idTenant"
  | "idAsesorPropietario"
  | "idQuimica"
  | "idDistribuidor"
  | "idProductor"
  | "idEstablecimiento"
  | "idLote"
  | "fechaCreacion"
  | "creadaPorUsuario"
  | "creadaPorNombre";

export interface IUpdateVisitaLote extends Omit<Partial<IVisitaLote>, OmitirUpdate> {}
