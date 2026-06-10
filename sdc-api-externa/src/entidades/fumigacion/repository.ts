import { Injectable } from '@nestjs/common';
import {
  IFumigacion,
  ICreateFumigacion,
  IListado,
  IQueryParam,
  IUpdateFumigacion,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class FumigacionsRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IFumigacion> {
    const url = `${API_DATOS}/fumigacions/${id}`;
    return await this.axios.GET<IFumigacion>(url);
  }

  async getByNombre(nombre: string): Promise<IFumigacion> {
    const url = `${API_DATOS}/fumigacions/nombre/${nombre}`;
    return await this.axios.GET<IFumigacion>(url);
  }

  async get(filtro: IQueryParam): Promise<IListado<IFumigacion>> {
    const url = `${API_DATOS}/fumigacions`;
    return await this.axios.GET<IListado<IFumigacion>>(url, {
      params: filtro,
    });
  }

  async create(data: ICreateFumigacion): Promise<IFumigacion> {
    const url = `${API_DATOS}/fumigacions`;
    return await this.axios.POST<IFumigacion>(url, data);
  }

  async bulk(data: ICreateFumigacion[]): Promise<void> {
    const url = `${API_DATOS}/fumigacions/bulk`;
    return await this.axios.POST<void>(url, data);
  }

  async update(id: string, data: IUpdateFumigacion): Promise<IFumigacion> {
    const url = `${API_DATOS}/fumigacions/${id}`;
    return await this.axios.PUT<IFumigacion>(url, data);
  }

  async delete(id: string): Promise<IFumigacion> {
    const url = `${API_DATOS}/fumigacions/${id}`;
    return await this.axios.DELETE<IFumigacion>(url);
  }
}
