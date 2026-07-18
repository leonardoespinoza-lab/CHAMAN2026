import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { OauthModel } from './oauth.model';
import OAuth2Server, { OAuthError } from '@node-oauth/oauth2-server';
import { ILogin } from './login.dto';
import { Request, Response } from 'express';
import { OAuth2Client, VerifyIdTokenOptions } from 'google-auth-library';
import {
  APPLE_CLIENT_ID,
  GOOGLE_CLIENT_ID,
  PASSWORD_DEFAULT_GOOGLE,
} from '../../env';
import { ICreateProductor, ICreateToken, ICreateUsuario } from 'modelos/src';
import { TokenService } from '../token/token.service';
import { UsuariosService } from '../usuario/service';
import { ProductorsService } from '../productor/service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OauthService {
  private logger = new Logger(OauthService.name);
  private oauth: OAuth2Server;
  private readonly accessTokenTTL = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 3600);
  private readonly refreshTokenTTL = Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 604800);
  private readonly sessionAbsoluteMs = Number(process.env.SESSION_ABSOLUTE_SECONDS || 2592000) * 1000;
  private readonly loginAttempts = new Map<string, { count: number; windowStartedAt: number; lockedUntil?: number }>();
  private readonly loginMaxAttempts = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
  private readonly loginWindowMs = Number(process.env.LOGIN_WINDOW_SECONDS || 900) * 1000;
  private readonly loginLockMs = Number(process.env.LOGIN_LOCK_SECONDS || 900) * 1000;

  // Cliente base sin TTL hardcodeado
  private baseClient = {
    _id: '62b9af7bd67c4a6e1714314b',
    redirectUris: [],
    grants: ['password', 'refresh_token'],
    clientSecret: '1',
    id: '1',
    __v: 0,
  };

  private oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);
  private oauthClientApple = new OAuth2Client(APPLE_CLIENT_ID);

  constructor(
    private oauthModel: OauthModel,
    private usuarios: UsuariosService,
    private productores: ProductorsService,
    private tokens: TokenService,
  ) {
    this.oauth = new OAuth2Server({
      model: this.oauthModel.getModel(),
      accessTokenLifetime: this.accessTokenTTL,
      refreshTokenLifetime: this.refreshTokenTTL,
      allowBearerTokensInQueryString: false,
      requireClientAuthentication: {
        password: false,
        refresh_token: false,
      },
    });
  }

  /**
   * Genera cliente OAuth con TTL dinámico
   */
  private getClientWithTTL(_remember = false) {
    return {
      ...this.baseClient,
      accessTokenLifetime: this.accessTokenTTL,
      refreshTokenLifetime: this.refreshTokenTTL,
    };
  }

  async googleLogin(idToken: string, remember = false) {
    if (!idToken) {
      this.logger.error('No se ha especificado el token');
      throw new BadRequestException('No se ha especificado el token');
    }
    const payload = await this.verifyGoogleToken(idToken);

    let existe = await this.usuarios.getByEmail(payload.email);

    if (!existe) {
      let productor = await this.productores.getByEmail(payload.email);
      if (!productor) {
        const createProductor: ICreateProductor = {
          idDistribuidor: '67ebecf924d876504503a647',
          idQuimica: '65f044fe3584e3c22061f786',
          nombre: payload.email,
          gratis: true,
        };
        productor = await this.productores.create(createProductor);
      }
      const user: ICreateUsuario = {
        email: payload.email,
        password: PASSWORD_DEFAULT_GOOGLE,
        datosPersonales: {
          nombre: payload.given_name,
          apellido: payload.family_name,
          foto: payload.picture,
        },
        username: payload.email,
        permisos: [
          {
            nivel: 'Productor',
            idProductor: productor._id,
            idQuimica: '65f044fe3584e3c22061f786',
            idDistribuidor: '67ebecf924d876504503a647',
            rol: 'Admin',
          },
        ],
      };
      existe = await this.usuarios.create(user);
    }

    // TTL dinámico basado en remember
    const now = new Date();
    const accessTokenTTL = this.accessTokenTTL * 1000;
    const refreshTokenTTL = this.refreshTokenTTL * 1000;

    const token: ICreateToken = {
      accessToken: idToken,
      accessTokenExpiresAt: new Date(
        now.getTime() + accessTokenTTL,
      ).toISOString(),
      refreshTokenExpiresAt: new Date(
        now.getTime() + refreshTokenTTL,
      ).toISOString(),
      sessionStartedAt: now.toISOString(),
      sessionLastActivityAt: now.toISOString(),
      sessionAbsoluteExpiresAt: new Date(now.getTime() + this.sessionAbsoluteMs).toISOString(),
      user: existe,
      client: this.getClientWithTTL(remember),
    };

    return await this.tokens.createToken(token);
  }

  async googleLoginApple(idToken: string, remember = false) {
    if (!idToken) {
      this.logger.error('No se ha especificado el token');
      throw new BadRequestException('No se ha especificado el token');
    }
    const payload = await this.verifyGoogleTokenApple(idToken);

    let existe = await this.usuarios.getByEmail(payload.email);

    if (!existe) {
      let productor = await this.productores.getByEmail(payload.email);
      if (!productor) {
        const createProductor: ICreateProductor = {
          idDistribuidor: '67ebecf924d876504503a647',
          idQuimica: '65f044fe3584e3c22061f786',
          nombre: payload.email,
          gratis: true,
        };
        productor = await this.productores.create(createProductor);
      }
      const user: ICreateUsuario = {
        email: payload.email,
        password: PASSWORD_DEFAULT_GOOGLE,
        datosPersonales: {
          nombre: payload.given_name,
          apellido: payload.family_name,
          foto: payload.picture,
        },
        username: payload.email,
        permisos: [
          {
            nivel: 'Productor',
            idProductor: productor._id,
            idQuimica: '65f044fe3584e3c22061f786',
            idDistribuidor: '67ebecf924d876504503a647',
            rol: 'Admin',
          },
        ],
      };
      existe = await this.usuarios.create(user);
    }

    // TTL dinámico basado en remember
    const now = new Date();
    const accessTokenTTL = this.accessTokenTTL * 1000;
    const refreshTokenTTL = this.refreshTokenTTL * 1000;

    const token: ICreateToken = {
      accessToken: idToken,
      accessTokenExpiresAt: new Date(
        now.getTime() + accessTokenTTL,
      ).toISOString(),
      refreshTokenExpiresAt: new Date(
        now.getTime() + refreshTokenTTL,
      ).toISOString(),
      sessionStartedAt: now.toISOString(),
      sessionLastActivityAt: now.toISOString(),
      sessionAbsoluteExpiresAt: new Date(now.getTime() + this.sessionAbsoluteMs).toISOString(),
      user: existe,
      client: this.getClientWithTTL(remember),
    };

    return await this.tokens.createToken(token);
  }

  private async verifyGoogleToken(token: string) {
    try {
      const options: VerifyIdTokenOptions = {
        idToken: token,
        audience: GOOGLE_CLIENT_ID,
      };
      const ticket = await this.oauthClient.verifyIdToken(options);
      const payload = ticket.getPayload();
      return payload;
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException('Token inválido');
    }
  }

  private async verifyGoogleTokenApple(token: string) {
    try {
      const options: VerifyIdTokenOptions = {
        idToken: token,
        audience: APPLE_CLIENT_ID,
      };
      const ticket = await this.oauthClientApple.verifyIdToken(options);
      const payload = ticket.getPayload();
      return payload;
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException('Token inválido');
    }
  }

  async login(req: Request, res: Response, body: ILogin) {
    const accountKey = String(body?.username || '').trim().toLowerCase();
    try {
      const { grant_type, username, refresh_token } = body;
      if (grant_type === 'password' && accountKey) {
        this.assertLoginAllowed(accountKey);
      }

      // Configurar TTL dinámicos en el modelo
      this.oauthModel.setDynamicTTL(this.accessTokenTTL, this.refreshTokenTTL);

      const request = new OAuth2Server.Request(req);
      const response = new OAuth2Server.Response(res);

      if (
        (grant_type === 'password' && username) ||
        (grant_type === 'refresh_token' && refresh_token)
      ) {
        const result = await this.oauth.token(request, response);
        if (grant_type === 'password' && accountKey) {
          this.loginAttempts.delete(accountKey);
        }

        // Limpiar TTL dinámicos después del uso
        this.oauthModel.clearDynamicTTL();

        return result;
      } else {
        this.oauthModel.clearDynamicTTL();
        throw new BadRequestException(
          'No se ha especificado un grant_type válido',
        );
      }
    } catch (err) {
      if (body?.grant_type === 'password' && accountKey && err instanceof OAuthError && err.name === 'invalid_grant') {
        this.recordFailedLogin(accountKey);
      }
      // Limpiar TTL dinámico en caso de error
      this.oauthModel.clearDynamicTTL();
      if (err instanceof OAuthError) {
        const error: OAuthError = err;
        if (error.name === 'invalid_client') {
          throw new BadRequestException(
            'No se ha especificado un client_id válido',
          );
        }
      }
      throw err;
    } finally {
      this.oauthModel.clearDynamicTTL();
    }
  }

  async logout(accessToken?: string, refreshToken?: string): Promise<boolean> {
    const token = accessToken
      ? await this.tokens.getToken(accessToken)
      : refreshToken
        ? await this.tokens.getRefreshToken(refreshToken)
        : undefined;
    if (token) {
      await this.tokens.revokeToken(token);
    }
    return true;
  }

  async authenticate(req: Request, res: Response) {
    const request = new OAuth2Server.Request(req);
    const response = new OAuth2Server.Response(res);
    const token = await this.oauth.authenticate(request, response);
    res.json(token);
  }

  async validate_password(username: string, password: string) {
    try {
      const user = await this.usuarios.getByUsername(username);
      if (!user) {
        return false;
      }
      return await bcrypt.compare(password, user.hash);
    } catch (err) {
      this.logger.error('Error al validar la contraseña');
      throw err;
    }
  }

  private assertLoginAllowed(accountKey: string): void {
    const attempt = this.loginAttempts.get(accountKey);
    if (attempt?.lockedUntil && attempt.lockedUntil > Date.now()) {
      throw new HttpException(
        'Demasiados intentos. Espere unos minutos antes de volver a intentar.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailedLogin(accountKey: string): void {
    const now = Date.now();
    const current = this.loginAttempts.get(accountKey);
    const active = current && now - current.windowStartedAt <= this.loginWindowMs
      ? current
      : { count: 0, windowStartedAt: now };
    active.count += 1;
    if (active.count >= this.loginMaxAttempts) {
      active.lockedUntil = now + this.loginLockMs;
    }
    this.loginAttempts.set(accountKey, active);
  }
}
