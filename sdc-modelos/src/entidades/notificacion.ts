export interface INotificacion {
  _id?: string;
  fechaCreacion?: Date;
  leido?: boolean;
  fechaLeido?: string;
  oculta?: boolean;
  fechaEliminacion?: Date;

  tenant?: {
    idQuimica?: string;
    idDistribuidor?: string;
    idProductor?: string;
    idEstablecimiento?: string;
    idUsuario?: string;
  };

  titulo?: string;
  mensaje?: string;
  data?: { [key: string]: string };

  /**
   * Identificador estable del hecho que origina la notificacion. Se duplica
   * fuera de `data` para poder imponer unicidad atomica por usuario sin
   * romper la lectura de documentos historicos.
   */
  eventKey?: string;

  /** Estado persistido del outbox de push. */
  entregaPush?: IEntregaPushNotificacion;
}

export type EstadoEntregaPush =
  | "reclamada"
  | "enviada"
  | "fallida"
  | "omitida";

export interface IEntregaPushNotificacion {
  estado: EstadoEntregaPush;
  claimId?: string;
  reclamadaEn?: Date;
  leaseHasta?: Date;
  enviadaEn?: Date;
  fallidaEn?: Date;
  omitidaEn?: Date;
  proximoIntentoEn?: Date;
  intentos?: number;
  detalle?: string;
}

export type MotivoClaimNotificacion =
  | "creada"
  | "reintento"
  | "duplicada"
  | "en-curso"
  | "espera-reintento"
  | "legacy";

export interface IResultadoClaimNotificacion {
  reclamada: boolean;
  motivo: MotivoClaimNotificacion;
  notificacion?: INotificacion;
}

export type ResultadoEntregaPush = "enviada" | "fallida" | "omitida";

export interface IFinalizarEntregaPushNotificacion {
  claimId: string;
  resultado: ResultadoEntregaPush;
  detalle?: string;
}

type OmitirCreate = "_id";
export interface ICreateNotificacion
  extends Omit<Partial<INotificacion>, OmitirCreate> {}

type OmitirUpdate = "_id";
export interface IUpdateNotificacion
  extends Omit<Partial<INotificacion>, OmitirUpdate> {}
