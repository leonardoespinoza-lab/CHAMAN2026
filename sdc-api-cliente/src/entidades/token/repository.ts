import { Injectable } from '@nestjs/common';
import { IToken } from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class TokensRepository {
  constructor(private axios: AxiosService) {}

  async getByAccessToken(ac: string): Promise<IToken> {
    const url = `${API_DATOS}/oauth/token/${ac}`;
    return await this.axios.GET<IToken>(url);
  }

  async revokeUserSessions(userId: string): Promise<void> {
    await this.axios.PUT(`${API_DATOS}/oauth/token/usuario/${userId}`, {});
  }
}
