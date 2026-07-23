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
  /**
   * Token anti-CSRF de la sesion web. No autentica por si mismo y puede ser
   * conservado por el cliente para enviarlo como cabecera.
   */
  csrfToken?: string;
  /** Indica que el refresh token se administra mediante cookie HttpOnly. */
  cookieAuth?: boolean;
}
