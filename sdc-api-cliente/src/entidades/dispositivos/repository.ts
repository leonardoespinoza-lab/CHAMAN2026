import { Injectable } from '@nestjs/common';
import {
  IDispositivo,
  IListado,
  IQueryParam,
  ICreateDispositivo,
  IUpdateDispositivo,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class DispositivosRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IDispositivo> {
    const url = `${API_DATOS}/dispositivos/${id}`;
    return await this.axios.GET<IDispositivo>(url);
  }

  async get(params: IQueryParam): Promise<IListado<IDispositivo>> {
    const url = `${API_DATOS}/dispositivos`;
    return await this.axios.GET<IListado<IDispositivo>>(url, { params });
  }

  async create(data: ICreateDispositivo): Promise<IDispositivo> {
    const url = `${API_DATOS}/dispositivos`;
    return await this.axios.POST<IDispositivo>(url, data);
  }

  async update(id: string, data: IUpdateDispositivo): Promise<IDispositivo> {
    const url = `${API_DATOS}/dispositivos/${id}`;
    return await this.axios.PUT<IDispositivo>(url, data);
  }

  async delete(id: string): Promise<IDispositivo> {
    const url = `${API_DATOS}/dispositivos/${id}`;
    return await this.axios.DELETE<IDispositivo>(url);
  }
}
