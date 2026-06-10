export interface ITokenPush {
  _id?: string;
  fechaCreacion?: string;
  tokenPush?: string;
  idUsuario?: string;
}

type OmitirCreate = "_id";
export interface ICreateTokenPush
  extends Omit<Partial<ITokenPush>, OmitirCreate> {}

type OmitirUpdate = "_id";
export interface IUpdateTokenPush
  extends Omit<Partial<ITokenPush>, OmitirUpdate> {}
