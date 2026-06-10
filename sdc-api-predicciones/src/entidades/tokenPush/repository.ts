import { Injectable } from '@nestjs/common';
import { ITokenPush, IListado, IQueryParam } from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class TokenPushsRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<ITokenPush> {
    const url = `${API_DATOS}/tokenpushs/${id}`;
    return await this.axios.GET<ITokenPush>(url);
  }

  async get(params: IQueryParam): Promise<IListado<ITokenPush>> {
    const url = `${API_DATOS}/tokenpushs`;
    return await this.axios.GET<IListado<ITokenPush>>(url, { params });
  }
}
