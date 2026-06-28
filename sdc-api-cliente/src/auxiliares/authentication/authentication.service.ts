import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { IToken } from 'modelos/src';
import { AuthenticationRepository } from './authentication.repository';
import { TokensService } from 'src/entidades/token/service';

@Injectable()
export class AuthenticationService {
  constructor(
    private repository: AuthenticationRepository,
    private tokenService: TokensService,
  ) {}

  async login(
    username: string,
    password: string,
    remember?: boolean,
  ): Promise<IToken> {
    try {
      const token = await this.repository.login(username, password, remember);
      if (!token.user?.activo) {
        throw new UnauthorizedException('Usuario deshabilitado');
      }
      if (!token.user?.permisos?.length) {
        throw new UnauthorizedException('Usuario sin permisos asignados');
      }
      return token;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      const status = error?.getStatus?.() || error?.status;
      const message = this.errorMessage(error);

      if (
        status === 400 ||
        status === 401 ||
        message.includes('invalid_grant') ||
        message.includes('invalid grant')
      ) {
        throw new UnauthorizedException(
          'Usuario o contrasena incorrectos. Verifique mayusculas y minusculas.',
        );
      }

      if (status === 503 || message.includes('503')) {
        throw new ServiceUnavailableException(
          'El servicio de autenticacion no esta disponible. Reintente en unos minutos.',
        );
      }

      throw error;
    }
  }

  async refreshToken(refreshToken: string): Promise<IToken> {
    const token = await this.repository.refreshToken(refreshToken);
    if (!token.user.activo) {
      throw new UnauthorizedException('Usuario deshabilitado');
    }
    return token;
  }

  async accessToken(accessToken: string): Promise<IToken> {
    const token = await this.tokenService.getByAccessToken(accessToken);
    if (!token.user.activo) {
      throw new UnauthorizedException('Usuario deshabilitado');
    }
    return token;
  }

  async authorization(authorization: string): Promise<IToken> {
    return await this.repository.authorization(authorization);
  }

  async googleLogin(body: {
    credential: string;
    remember?: boolean;
  }): Promise<IToken> {
    return await this.repository.googleLogin(body);
  }

  async googleLoginApple(body: {
    credential: string;
    remember?: boolean;
  }): Promise<IToken> {
    return await this.repository.googleLoginApple(body);
  }

  async validatePassword(usernname: string, password: string) {
    return await this.repository.validate_password(usernname, password);
  }

  private errorMessage(error: any): string {
    const response = error?.response;
    const message =
      (typeof response === 'string' ? response : response?.message) ||
      error?.message ||
      '';
    return String(message).toLowerCase();
  }
}
