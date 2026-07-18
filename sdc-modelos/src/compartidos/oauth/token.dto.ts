import { ICreateClient } from "./client.dto";
import { IUsuario } from "../../entidades/usuario";

export interface ICreateToken {
  accessToken: string;
  accessTokenExpiresAt?: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  scope?: string | string[];
  sessionStartedAt?: string;
  sessionLastActivityAt?: string;
  sessionAbsoluteExpiresAt?: string;
  client: ICreateClient;
  user: IUsuario;
}
