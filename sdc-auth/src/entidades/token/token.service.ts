import { Injectable } from '@nestjs/common';
import { ICreateToken, IToken } from 'modelos/src';
import { TokenRepository } from './token.repository';

@Injectable()
export class TokenService {
  constructor(private repository: TokenRepository) {}

  async getToken(token: string): Promise<IToken> {
    return await this.repository.getToken(token);
  }

  async getRefreshToken(token: string): Promise<IToken> {
    return await this.repository.getRefreshToken(token);
  }

  async createToken(datos: ICreateToken): Promise<IToken> {
    return await this.repository.createToken(datos);
  }

  async revokeToken(token: IToken): Promise<boolean> {
    return await this.repository.revokeToken(token);
  }

  async revokeUserSessions(idUsuario: string): Promise<number> {
    return await this.repository.revokeUserSessions(idUsuario);
  }
}
