import { Injectable } from '@nestjs/common';
import { ICreateToken, IToken } from 'modelos/src';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { API_DATOS } from '../../env';

@Injectable()
export class TokenRepository {
  constructor(private axios: AxiosService) {}

  async getToken(token: string): Promise<IToken> {
    const url = `${API_DATOS}/oauth/token/${token}`;
    return await this.axios.GET<IToken>(url);
  }

  async getRefreshToken(token: string): Promise<IToken> {
    const url = `${API_DATOS}/oauth/refreshToken/${token}`;
    return await this.axios.GET<IToken>(url);
  }

  async createToken(datos: ICreateToken): Promise<IToken> {
    const url = `${API_DATOS}/oauth/token`;
    return await this.axios.POST<IToken>(url, datos);
  }

  async revokeToken(token: IToken): Promise<boolean> {
    const url = `${API_DATOS}/oauth/token`;
    return await this.axios.PUT<boolean>(url, token);
  }

  async revokeUserSessions(idUsuario: string): Promise<number> {
    const url = `${API_DATOS}/oauth/token/usuario/${idUsuario}`;
    return await this.axios.PUT<number>(url, {});
  }
}
