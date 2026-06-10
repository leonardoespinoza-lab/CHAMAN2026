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
} from 'oauth2-server';
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
    this.logger.verbose(`Client ${clientId}:${clientSecret} not found`);
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
        delete usuario.hash;
        return usuario;
      }
    }
    this.logger.verbose(`Usuario ${username} clave ${password} invalida`);
  }

  // Token

  private async getAccessToken(accessToken: string): Promise<Token | Falsey> {
    const token = await this.tokenService.getToken(accessToken);
    if (token) {
      const returnToken: Token = {
        accessToken: token.accessToken,
        client: token.client as any,
        user: token.user as any,
        accessTokenExpiresAt: new Date(token.accessTokenExpiresAt),
        refreshToken: token.refreshToken,
        refreshTokenExpiresAt: new Date(token.refreshTokenExpiresAt),
        scope: token.scope,
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
    const tokenToSave: ICreateToken = {
      accessToken: token.accessToken,
      accessTokenExpiresAt: token.accessTokenExpiresAt.toISOString(),
      client: client as any,
      user: user as any,
      refreshToken: token.refreshToken,
      refreshTokenExpiresAt: token.refreshTokenExpiresAt.toISOString(),
    };
    const savedToken = await this.tokenService.createToken(tokenToSave);
    if (savedToken) {
      this.logger.verbose(`Token ${token.accessToken} saved`);
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
      const returnToken: RefreshToken = {
        accessToken: token.accessToken,
        client: token.client as any,
        user: token.user as any,
        accessTokenExpiresAt: new Date(token.accessTokenExpiresAt),
        refreshToken: token.refreshToken,
        refreshTokenExpiresAt: new Date(token.refreshTokenExpiresAt),
        scope: token.scope,
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
