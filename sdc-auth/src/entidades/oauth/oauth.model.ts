import { Injectable, Logger } from '@nestjs/common';
import { ICreateToken } from 'modelos/src';
import {
  RefreshTokenModel,
  PasswordModel,
  Client,
  RefreshToken,
  Token,
  User,
  Falsey,
} from '@node-oauth/oauth2-server';
import { ClientsService } from '../client/client.service';
import { TokenService } from '../token/token.service';
import { UsuariosService } from '../usuario/service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OauthModel {
  private logger = new Logger(OauthModel.name);
  private dynamicClientTTL: {
    accessTokenLifetime?: number;
    refreshTokenLifetime?: number;
  } | null = null;
  private readonly sessionIdleMs =
    Number(process.env.SESSION_IDLE_SECONDS || 30 * 60) * 1000;
  private readonly sessionAbsoluteMs =
    Number(process.env.SESSION_ABSOLUTE_SECONDS || 8 * 60 * 60) * 1000;

  constructor(
    private usuariosService: UsuariosService,
    private clientsService: ClientsService,
    private tokenService: TokenService,
  ) {}

  // Método para configurar TTL dinámicos
  public setDynamicTTL(
    accessTokenLifetime: number,
    refreshTokenLifetime: number,
  ) {
    this.dynamicClientTTL = { accessTokenLifetime, refreshTokenLifetime };
  }

  public clearDynamicTTL() {
    this.dynamicClientTTL = null;
  }

  // Client

  private async getClient(
    clientId: string,
    clientSecret: string,
  ): Promise<Client | Falsey> {
    const client = await this.clientsService.getClient(clientId, clientSecret);
    if (client) {
      // Si hay TTL dinámicos configurados, los aplicamos
      if (this.dynamicClientTTL) {
        return {
          ...client,
          accessTokenLifetime:
            this.dynamicClientTTL.accessTokenLifetime ||
            client.accessTokenLifetime,
          refreshTokenLifetime:
            this.dynamicClientTTL.refreshTokenLifetime ||
            client.refreshTokenLifetime,
        };
      }
      return client;
    }
    this.logger.verbose(`Client ${clientId} not found`);
  }

  // Usuario

  private async getUser(
    username: string,
    password: string,
  ): Promise<User | Falsey> {
    const usuario = await this.usuariosService.getByUsername(username);
    if (usuario && password) {
      const claveCoincide = await bcrypt.compare(password, usuario.hash);
      if (claveCoincide) {
        const liveUser = await this.getLiveEligibleUser(usuario);
        if (liveUser) return liveUser;
      }
    }
    this.logger.verbose(`Usuario ${username} con clave invalida`);
  }

  // Token

  private async getAccessToken(accessToken: string): Promise<Token | Falsey> {
    const token = await this.tokenService.getToken(accessToken);
    if (token) {
      const liveUser = await this.getLiveEligibleUser(token.user, token);
      if (!liveUser) return false;
      const returnToken: Token = {
        accessToken: token.accessToken,
        client: token.client as any,
        user: liveUser,
        accessTokenExpiresAt: new Date(token.accessTokenExpiresAt),
        refreshToken: token.refreshToken,
        refreshTokenExpiresAt: new Date(token.refreshTokenExpiresAt),
        scope: this.publicScope(token.scope),
      };
      return returnToken;
    }
    this.logger.verbose('Token not found');
  }

  private async saveToken(
    token: Token,
    client: Client,
    user: User,
  ): Promise<Token | Falsey> {
    token.client = client;
    token.user = user;
    const now = new Date();
    const session = this.sessionMetadata(token.scope, now);
    const tokenToSave: ICreateToken = {
      accessToken: token.accessToken,
      accessTokenExpiresAt: token.accessTokenExpiresAt.toISOString(),
      client: client as any,
      user: user as any,
      refreshToken: token.refreshToken,
      refreshTokenExpiresAt: token.refreshTokenExpiresAt?.toISOString(),
      scope: this.publicScope(token.scope),
      sessionStartedAt: session.startedAt.toISOString(),
      sessionLastActivityAt: now.toISOString(),
      sessionAbsoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
    };
    const savedToken = await this.tokenService.createToken(tokenToSave);
    if (savedToken) {
      this.logger.verbose('Token saved');
      const returnToken: Token = {
        accessToken: savedToken.accessToken,
        client: savedToken.client as any,
        user: savedToken.user as any,
        accessTokenExpiresAt: new Date(savedToken.accessTokenExpiresAt),
        refreshToken: savedToken.refreshToken,
        refreshTokenExpiresAt: new Date(savedToken.refreshTokenExpiresAt),
        scope: token.scope,
      };
      return returnToken;
    }
    this.logger.verbose('Token not saved');
  }

  private async getRefreshToken(
    refreshToken: string,
  ): Promise<RefreshToken | Falsey> {
    const token = await this.tokenService.getRefreshToken(refreshToken);
    if (token) {
      const now = Date.now();
      const startedAt = this.validDate(token.sessionStartedAt) || new Date(now);
      const lastActivityAt =
        this.validDate(token.sessionLastActivityAt) || startedAt;
      const absoluteExpiresAt =
        this.validDate(token.sessionAbsoluteExpiresAt) ||
        new Date(startedAt.getTime() + this.sessionAbsoluteMs);
      if (
        absoluteExpiresAt.getTime() <= now ||
        now - lastActivityAt.getTime() > this.sessionIdleMs
      ) {
        await this.tokenService.revokeToken(token);
        return false;
      }
      const liveUser = await this.getLiveEligibleUser(token.user, token);
      if (!liveUser) return false;
      const returnToken: RefreshToken = {
        accessToken: token.accessToken,
        client: token.client as any,
        user: liveUser,
        accessTokenExpiresAt: new Date(token.accessTokenExpiresAt),
        refreshToken: token.refreshToken,
        refreshTokenExpiresAt: new Date(token.refreshTokenExpiresAt),
        scope: this.sessionScope(token.scope, startedAt, absoluteExpiresAt),
      };
      return returnToken;
    }
    this.logger.verbose('Token not found');
  }

  private async revokeToken(token: RefreshToken | Token): Promise<boolean> {
    const revoked = await this.tokenService.revokeToken(token as any);
    if (revoked) {
      return true;
    }
    this.logger.verbose('Token not deleted');
  }

  private async getLiveEligibleUser(
    snapshot: User | any,
    token?: ICreateToken | any,
  ): Promise<User | Falsey> {
    const userId = String(snapshot?._id || '').trim();
    if (!userId) {
      if (token) await this.revokeInvalidSession(token);
      return false;
    }

    const eligibility =
      await this.usuariosService.getSessionEligibility(userId);
    if (!eligibility?.eligible || !eligibility.user) {
      if (token) await this.revokeInvalidSession(token);
      return false;
    }
    return eligibility.user as any;
  }

  private async revokeInvalidSession(token: ICreateToken | any): Promise<void> {
    try {
      await this.tokenService.revokeToken(token);
    } catch {
      // Authentication still fails closed. A later tenant/user archival retry
      // performs the idempotent bulk cleanup if this individual delete failed.
      this.logger.warn('No se pudo completar la revocacion de una sesion invalida');
    }
  }

  private validDate(value?: string): Date | undefined {
    const date = value ? new Date(value) : undefined;
    return date && Number.isFinite(date.getTime()) ? date : undefined;
  }

  private publicScope(scope?: string | string[]): string[] | undefined {
    const values = Array.isArray(scope)
      ? scope
      : String(scope || '')
          .split(' ')
          .filter(Boolean);
    const publicValues = values.filter(
      (value) => !value.startsWith('chaman_session_'),
    );
    return publicValues.length ? publicValues : undefined;
  }

  private sessionScope(
    scope: string | string[] | undefined,
    startedAt: Date,
    absoluteExpiresAt: Date,
  ): string[] {
    return [
      ...(this.publicScope(scope) || []),
      `chaman_session_started_${startedAt.getTime()}`,
      `chaman_session_absolute_${absoluteExpiresAt.getTime()}`,
    ];
  }

  private sessionMetadata(scope: string | string[] | undefined, now: Date) {
    const values = Array.isArray(scope)
      ? scope
      : String(scope || '')
          .split(' ')
          .filter(Boolean);
    const startedRaw = values
      .find((value) => value.startsWith('chaman_session_started_'))
      ?.replace('chaman_session_started_', '');
    const absoluteRaw = values
      .find((value) => value.startsWith('chaman_session_absolute_'))
      ?.replace('chaman_session_absolute_', '');
    const startedAt = Number.isFinite(Number(startedRaw))
      ? new Date(Number(startedRaw))
      : now;
    const absoluteExpiresAt = Number.isFinite(Number(absoluteRaw))
      ? new Date(Number(absoluteRaw))
      : new Date(startedAt.getTime() + this.sessionAbsoluteMs);
    return { startedAt, absoluteExpiresAt };
  }

  //

  public getModel() {
    const oauthModel: RefreshTokenModel & PasswordModel = {
      getAccessToken: this.getAccessToken.bind(this),
      getClient: this.getClient.bind(this),
      saveToken: this.saveToken.bind(this),
      getUser: this.getUser.bind(this),
      getRefreshToken: this.getRefreshToken.bind(this),
      revokeToken: this.revokeToken.bind(this),
      verifyScope: null,
    };
    return oauthModel;
  }
}
