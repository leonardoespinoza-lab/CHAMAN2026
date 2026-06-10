import { Injectable } from '@nestjs/common';
import {
  IEstacion,
  ICreateEstacion,
  IListado,
  IQueryParam,
  IUpdateEstacion,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class EstacionsRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IEstacion> {
    const url = `${API_DATOS}/estacions/${id}`;
    return await this.axios.GET<IEstacion>(url);
  }

  async getFiltered(filtro: IQueryParam): Promise<IListado<IEstacion>> {
    const url = `${API_DATOS}/estacions`;
    return await this.axios.GET<IListado<IEstacion>>(url, {
      params: filtro,
    });
  }

  async create(data: ICreateEstacion): Promise<IEstacion> {
    const url = `${API_DATOS}/estacions`;
    return await this.axios.POST<IEstacion>(url, data);
  }

  async update(id: string, data: IUpdateEstacion): Promise<IEstacion> {
    const url = `${API_DATOS}/estacions/${id}`;
    return await this.axios.PUT<IEstacion>(url, data);
  }

  async delete(id: string): Promise<IEstacion> {
    const url = `${API_DATOS}/estacions/${id}`;
    return await this.axios.DELETE<IEstacion>(url);
  }
}
