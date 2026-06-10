import { Injectable } from '@nestjs/common';
import {
  IAgroquimico,
  ICreateAgroquimico,
  IListado,
  IQueryParam,
  IUpdateAgroquimico,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class AgroquimicosRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IAgroquimico> {
    const url = `${API_DATOS}/agroquimicos/${id}`;
    return await this.axios.GET<IAgroquimico>(url);
  }

  async getByNombre(nombre: string): Promise<IAgroquimico> {
    const url = `${API_DATOS}/agroquimicos/nombre/${nombre}`;
    return await this.axios.GET<IAgroquimico>(url);
  }

  async get(filtro: IQueryParam): Promise<IListado<IAgroquimico>> {
    const url = `${API_DATOS}/agroquimicos`;
    return await this.axios.GET<IListado<IAgroquimico>>(url, {
      params: filtro,
    });
  }

  async create(data: ICreateAgroquimico): Promise<IAgroquimico> {
    const url = `${API_DATOS}/agroquimicos`;
    return await this.axios.POST<IAgroquimico>(url, data);
  }

  async bulk(data: ICreateAgroquimico[]): Promise<void> {
    const url = `${API_DATOS}/agroquimicos/bulk`;
    return await this.axios.POST<void>(url, data);
  }

  async update(id: string, data: IUpdateAgroquimico): Promise<IAgroquimico> {
    const url = `${API_DATOS}/agroquimicos/${id}`;
    return await this.axios.PUT<IAgroquimico>(url, data);
  }

  async delete(id: string): Promise<IAgroquimico> {
    const url = `${API_DATOS}/agroquimicos/${id}`;
    return await this.axios.DELETE<IAgroquimico>(url);
  }
}
