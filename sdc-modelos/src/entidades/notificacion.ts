export interface INotificacion {
  _id?: string;
  fechaCreacion?: Date;
  leido?: boolean;
  fechaLeido?: string;

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
}

type OmitirCreate = "_id";
export interface ICreateNotificacion
  extends Omit<Partial<INotificacion>, OmitirCreate> {}

type OmitirUpdate = "_id";
export interface IUpdateNotificacion
  extends Omit<Partial<INotificacion>, OmitirUpdate> {}
