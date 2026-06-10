import { Injectable } from '@nestjs/common';
import { IApikey, ICreateApikey, IListado, IQueryParam } from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class ApiKeyRepository {
  constructor(private axios: AxiosService) {}

  async get(params: IQueryParam): Promise<IListado<IApikey>> {
    const url = `${API_DATOS}/apikeys`;
    return await this.axios.GET<IListado<IApikey>>(url, { params });
  }

  async getByApikey(key: string): Promise<IApikey> {
    const url = `${API_DATOS}/apikeys/apikey/${key}`;
    return await this.axios.GET<IApikey>(url);
  }

  async create(data: ICreateApikey): Promise<IApikey> {
    const url = `${API_DATOS}/apikeys`;
    return await this.axios.POST<IApikey>(url, data);
  }
}
