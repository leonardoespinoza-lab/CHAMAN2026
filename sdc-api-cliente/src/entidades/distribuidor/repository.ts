import { Injectable } from '@nestjs/common';
import {
  IDistribuidor,
  IListado,
  IQueryParam,
  ICreateDistribuidor,
  IUpdateDistribuidor,
  ISolicitudArchivado,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class DistribuidorsRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IDistribuidor> {
    const url = `${API_DATOS}/distribuidors/${id}`;
    return await this.axios.GET<IDistribuidor>(url);
  }

  async get(params: IQueryParam): Promise<IListado<IDistribuidor>> {
    const url = `${API_DATOS}/distribuidors`;
    return await this.axios.GET<IListado<IDistribuidor>>(url, { params });
  }

  async create(data: ICreateDistribuidor): Promise<IDistribuidor> {
    const url = `${API_DATOS}/distribuidors`;
    return await this.axios.POST<IDistribuidor>(url, data);
  }

  async update(id: string, data: IUpdateDistribuidor): Promise<IDistribuidor> {
    const url = `${API_DATOS}/distribuidors/${id}`;
    return await this.axios.PUT<IDistribuidor>(url, data);
  }

  async delete(
    id: string,
    audit: ISolicitudArchivado = {},
  ): Promise<IDistribuidor> {
    const url = `${API_DATOS}/distribuidors/${id}`;
    return await this.axios.DELETE<IDistribuidor>(url, { params: audit });
  }
}
