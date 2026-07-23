import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
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
import {
  ICreateProductor,
  ICreateToken,
  ICreateUsuario,
  IUsuario,
} from 'modelos/src';
import { isIP } from 'node:net';
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
  private readonly sessionAbsoluteMs = Number(process.env.SESSION_ABSOLUTE_SECONDS || 28800) * 1000;
  private readonly loginAttempts = new Map<string, { count: number; windowStartedAt: number; lockedUntil?: number }>();
  private readonly loginMaxAttempts = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
  private readonly loginWindowMs = Number(process.env.LOGIN_WINDOW_SECONDS || 900) * 1000;
  private readonly loginLockMs = Number(process.env.LOGIN_LOCK_SECONDS || 900) * 1000;
  private readonly loginAttemptsMaxEntries = (() => {
    const parsed = Number(process.env.LOGIN_ATTEMPTS_MAX_ENTRIES);
    return Number.isInteger(parsed) && parsed >= 100 && parsed <= 50000
      ? parsed
      : 10000;
  })();
  private loginAttemptsLastPrunedAt = 0;

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
    await this.assertSocialUserEligible(existe);

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
    await this.assertSocialUserEligible(existe);

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
    const attemptKey = this.loginAttemptKey(accountKey, req);
    try {
      const { grant_type, username, refresh_token } = body;
      if (grant_type === 'password' && accountKey) {
        this.assertLoginAllowed(attemptKey);
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
          this.loginAttempts.delete(attemptKey);
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
        this.recordFailedLogin(attemptKey);
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

  async validate_password(
    username: string,
    password: string,
    req?: Request,
  ) {
    const accountKey = String(username || '').trim().toLowerCase();
    const attemptKey = this.loginAttemptKey(accountKey, req);
    try {
      this.assertLoginAllowed(attemptKey);
      const user = await this.usuarios.getByUsername(username);
      if (!user) {
        this.recordFailedLogin(attemptKey);
        return false;
      }
      const eligibility = await this.usuarios.getSessionEligibility(user._id);
      if (!eligibility?.eligible) {
        this.recordFailedLogin(attemptKey);
        return false;
      }
      const valid = await bcrypt.compare(password, user.hash);
      if (valid) {
        this.loginAttempts.delete(attemptKey);
      } else {
        this.recordFailedLogin(attemptKey);
      }
      return valid;
    } catch (err) {
      this.logger.error('Error al validar la contraseña');
      throw err;
    }
  }

  private assertLoginAllowed(attemptKey: string): void {
    const now = Date.now();
    this.pruneLoginAttempts(now);
    const attempt = this.loginAttempts.get(attemptKey);
    if (attempt && this.loginAttemptExpiresAt(attempt) <= now) {
      this.loginAttempts.delete(attemptKey);
      return;
    }
    if (attempt?.lockedUntil && attempt.lockedUntil > Date.now()) {
      throw new HttpException(
        'Demasiados intentos. Espere unos minutos antes de volver a intentar.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async assertSocialUserEligible(user?: IUsuario): Promise<void> {
    if (user && (user.activo === false || user.archivado === true)) {
      throw new UnauthorizedException(
        'El usuario se encuentra inactivo o archivado',
      );
    }
    if (user?._id) {
      const eligibility =
        await this.usuarios.getSessionEligibility(user._id);
      if (!eligibility?.eligible) {
        throw new UnauthorizedException(
          'El usuario o su tenant no se encuentran activos',
        );
      }
    }
  }

  private recordFailedLogin(attemptKey: string): void {
    const now = Date.now();
    this.pruneLoginAttempts(now);
    const current = this.loginAttempts.get(attemptKey);
    const active = current && now - current.windowStartedAt <= this.loginWindowMs
      ? current
      : { count: 0, windowStartedAt: now };
    active.count += 1;
    if (active.count >= this.loginMaxAttempts) {
      active.lockedUntil = now + this.loginLockMs;
    }
    if (!current && this.loginAttempts.size >= this.loginAttemptsMaxEntries) {
      const oldestKey = this.loginAttempts.keys().next().value as
        | string
        | undefined;
      if (oldestKey) {
        this.loginAttempts.delete(oldestKey);
      }
    }
    this.loginAttempts.delete(attemptKey);
    this.loginAttempts.set(attemptKey, active);
  }

  private loginAttemptKey(accountKey: string, req?: Request): string {
    const internalOrigin = String(
      req?.headers?.['x-chaman-login-origin'] || '',
    ).trim();
    const forwarded = String(req?.headers?.['x-forwarded-for'] || '');
    const candidates = [
      internalOrigin,
      forwarded.split(',')[0].trim(),
      String(req?.ip || '').trim(),
      String(req?.socket?.remoteAddress || '').trim(),
    ];
    const origin =
      candidates
        .map((candidate) => candidate.slice(0, 128))
        .find((candidate) => isIP(candidate)) || 'internal';
    return `${accountKey.slice(0, 254)}|${origin}`;
  }

  private loginAttemptExpiresAt(attempt: {
    windowStartedAt: number;
    lockedUntil?: number;
  }): number {
    return Math.max(
      attempt.windowStartedAt + this.loginWindowMs,
      attempt.lockedUntil || 0,
    );
  }

  private pruneLoginAttempts(now: number): void {
    const pruneIntervalMs = Math.min(this.loginWindowMs, 60_000);
    if (
      this.loginAttempts.size < this.loginAttemptsMaxEntries &&
      now - this.loginAttemptsLastPrunedAt < pruneIntervalMs
    ) {
      return;
    }

    for (const [key, attempt] of this.loginAttempts) {
      if (this.loginAttemptExpiresAt(attempt) <= now) {
        this.loginAttempts.delete(key);
      }
    }
    this.loginAttemptsLastPrunedAt = now;
  }
}
