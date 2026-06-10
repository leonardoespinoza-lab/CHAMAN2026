import { Injectable } from '@nestjs/common';
import { IToken } from 'modelos/src';
import { AxiosService } from '../axios/axios.service';
import { API_AUTH } from '../../env';

@Injectable()
export class AuthenticationRepository {
  constructor(private axios: AxiosService) {}

  async authorization(authorization: string): Promise<IToken> {
    const url = `${API_AUTH}/oauth/authenticate`;
    const headers = {
      authorization: authorization,
      'content-type': 'application/x-www-form-urlencoded',
    };
    return await this.axios.POST<IToken>(url, {}, { headers });
  }
}
