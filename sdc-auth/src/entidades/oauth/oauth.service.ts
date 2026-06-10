import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OauthModel } from './oauth.model';
import OAuth2Server, { OAuthError } from 'oauth2-server';
import { ILogin } from './login.dto';
import { Request, Response } from 'express';
import { OAuth2Client, VerifyIdTokenOptions } from 'google-auth-library';
import {
  APPLE_CLIENT_ID,
  GOOGLE_CLIENT_ID,
  PASSWORD_DEFAULT_GOOGLE,
} from 'src/env';
import { ICreateProductor, ICreateToken, ICreateUsuario } from 'modelos/src';
import { TokenService } from '../token/token.service';
import { UsuariosService } from '../usuario/service';
import { ProductorsService } from '../productor/service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OauthService {
  private logger = new Logger(OauthService.name);
  private oauth: OAuth2Server;

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
      accessTokenLifetime: 60 * 60 * 24 * 365 * 10, // 10  Años
      allowBearerTokensInQueryString: true,
      requireClientAuthentication: false,
    });
  }

  /**
   * Genera cliente OAuth con TTL dinámico
   */
  private getClientWithTTL(remember = false) {
    const accessTokenTTL = remember ? 30 * 24 * 60 * 60 : 24 * 60 * 60; // 30 días vs 24 horas (en segundos)
    const refreshTokenTTL = remember ? 60 * 24 * 60 * 60 : 7 * 24 * 60 * 60; // 60 días vs 7 días (en segundos)

    return {
      ...this.baseClient,
      accessTokenLifetime: accessTokenTTL,
      refreshTokenLifetime: refreshTokenTTL,
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
    const accessTokenTTL = remember
      ? 30 * 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000; // 30 días vs 24 horas
    const refreshTokenTTL = remember
      ? 60 * 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000; // 60 días vs 7 días

    const token: ICreateToken = {
      accessToken: idToken,
      accessTokenExpiresAt: new Date(
        now.getTime() + accessTokenTTL,
      ).toISOString(),
      refreshTokenExpiresAt: new Date(
        now.getTime() + refreshTokenTTL,
      ).toISOString(),
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
    const accessTokenTTL = remember
      ? 30 * 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000; // 30 días vs 24 horas
    const refreshTokenTTL = remember
      ? 60 * 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000; // 60 días vs 7 días

    const token: ICreateToken = {
      accessToken: idToken,
      accessTokenExpiresAt: new Date(
        now.getTime() + accessTokenTTL,
      ).toISOString(),
      refreshTokenExpiresAt: new Date(
        now.getTime() + refreshTokenTTL,
      ).toISOString(),
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
    try {
      const { grant_type, username, refresh_token, remember = false } = body;

      // Configurar TTL dinámicos en el modelo
      const accessTokenTTL = remember ? 30 * 24 * 60 * 60 : 24 * 60 * 60; // 30 días vs 24 horas (en segundos)
      const refreshTokenTTL = remember ? 60 * 24 * 60 * 60 : 7 * 24 * 60 * 60; // 60 días vs 7 días (en segundos)

      this.oauthModel.setDynamicTTL(accessTokenTTL, refreshTokenTTL);

      const request = new OAuth2Server.Request(req);
      const response = new OAuth2Server.Response(res);

      if (
        (grant_type === 'password' && username) ||
        (grant_type === 'refresh_token' && refresh_token)
      ) {
        const result = await this.oauth.token(request, response);

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
      console.error(err);
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
    }
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
      console.error(err);
      throw err;
    }
  }
}
