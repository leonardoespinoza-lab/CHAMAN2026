import { Injectable } from '@nestjs/common';
import {
  ICrono,
  ICreateCrono,
  IListado,
  IQueryParam,
  IUpdateCrono,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class CronosRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<ICrono> {
    const url = `${API_DATOS}/cronos/${id}`;
    return await this.axios.GET<ICrono>(url);
  }

  async getByNombre(nombre: string): Promise<ICrono> {
    const url = `${API_DATOS}/cronos/nombre/${nombre}`;
    return await this.axios.GET<ICrono>(url);
  }

  async get(filtro: IQueryParam): Promise<IListado<ICrono>> {
    const url = `${API_DATOS}/cronos`;
    return await this.axios.GET<IListado<ICrono>>(url, {
      params: filtro,
    });
  }

  async create(data: ICreateCrono): Promise<ICrono> {
    const url = `${API_DATOS}/cronos`;
    return await this.axios.POST<ICrono>(url, data);
  }

  async bulk(data: ICreateCrono[]): Promise<void> {
    const url = `${API_DATOS}/cronos/bulk`;
    return await this.axios.POST<void>(url, data);
  }

  async update(id: string, data: IUpdateCrono): Promise<ICrono> {
    const url = `${API_DATOS}/cronos/${id}`;
    return await this.axios.PUT<ICrono>(url, data);
  }

  async delete(id: string): Promise<ICrono> {
    const url = `${API_DATOS}/cronos/${id}`;
    return await this.axios.DELETE<ICrono>(url);
  }
}
