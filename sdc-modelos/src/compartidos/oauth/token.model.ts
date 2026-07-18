import { IClient } from "./client.model";
import { IUsuario } from "../../entidades/usuario";

export interface IToken {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  scope?: string | string[];
  sessionStartedAt?: string;
  sessionLastActivityAt?: string;
  sessionAbsoluteExpiresAt?: string;
  client: IClient;
  user: IUsuario;
}
