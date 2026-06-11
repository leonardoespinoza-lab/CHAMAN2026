import { Injectable } from '@nestjs/common';
import {
  ICreateMaleza,
  IListado,
  IMaleza,
  IQueryParam,
  IUpdateMaleza,
} from 'modelos/src';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { API_DATOS } from '../../env';

@Injectable()
export class MalezasRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IMaleza> {
    const url = `${API_DATOS}/malezas/${id}`;
    return await this.axios.GET<IMaleza>(url);
  }

  async get(params: IQueryParam): Promise<IListado<IMaleza>> {
    const url = `${API_DATOS}/malezas`;
    return await this.axios.GET<IListado<IMaleza>>(url, { params });
  }

  async create(data: ICreateMaleza): Promise<IMaleza> {
    const url = `${API_DATOS}/malezas`;
    return await this.axios.POST<IMaleza>(url, data);
  }

  async bulk(data: ICreateMaleza[]): Promise<void> {
    const url = `${API_DATOS}/malezas/bulk`;
    return await this.axios.POST<void>(url, data);
  }

  async update(id: string, data: IUpdateMaleza): Promise<IMaleza> {
    const url = `${API_DATOS}/malezas/${id}`;
    return await this.axios.PUT<IMaleza>(url, data);
  }

  async delete(id: string): Promise<IMaleza> {
    const url = `${API_DATOS}/malezas/${id}`;
    return await this.axios.DELETE<IMaleza>(url);
  }
}
