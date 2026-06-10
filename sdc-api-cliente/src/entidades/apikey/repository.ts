import { Injectable } from '@nestjs/common';
import {
  IApikey,
  IListado,
  IQueryParam,
  ICreateApikey,
  IUpdateApikey,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class ApikeysRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IApikey> {
    const url = `${API_DATOS}/apikeys/${id}`;
    return await this.axios.GET<IApikey>(url);
  }

  async get(params: IQueryParam): Promise<IListado<IApikey>> {
    const url = `${API_DATOS}/apikeys`;
    return await this.axios.GET<IListado<IApikey>>(url, { params });
  }

  async create(data: ICreateApikey): Promise<IApikey> {
    const url = `${API_DATOS}/apikeys`;
    return await this.axios.POST<IApikey>(url, data);
  }

  async update(id: string, data: IUpdateApikey): Promise<IApikey> {
    const url = `${API_DATOS}/apikeys/${id}`;
    return await this.axios.PUT<IApikey>(url, data);
  }

  async delete(id: string): Promise<IApikey> {
    const url = `${API_DATOS}/apikeys/${id}`;
    return await this.axios.DELETE<IApikey>(url);
  }
}
