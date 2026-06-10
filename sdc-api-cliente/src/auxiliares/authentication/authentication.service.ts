import { Injectable, UnauthorizedException } from '@nestjs/common';
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
    return await this.repository.login(username, password, remember);
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
}
