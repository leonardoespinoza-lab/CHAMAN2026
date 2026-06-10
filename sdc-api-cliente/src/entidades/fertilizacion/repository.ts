import { Injectable } from '@nestjs/common';
import {
  IFertilizacion,
  ICreateFertilizacion,
  IListado,
  IQueryParam,
  IUpdateFertilizacion,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class FertilizacionsRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IFertilizacion> {
    const url = `${API_DATOS}/fertilizacions/${id}`;
    return await this.axios.GET<IFertilizacion>(url);
  }

  async get(filtro: IQueryParam): Promise<IListado<IFertilizacion>> {
    const url = `${API_DATOS}/fertilizacions`;
    return await this.axios.GET<IListado<IFertilizacion>>(url, {
      params: filtro,
    });
  }

  async create(data: ICreateFertilizacion): Promise<IFertilizacion> {
    const url = `${API_DATOS}/fertilizacions`;
    return await this.axios.POST<IFertilizacion>(url, data);
  }

  async bulk(data: ICreateFertilizacion[]): Promise<void> {
    const url = `${API_DATOS}/fertilizacions/bulk`;
    return await this.axios.POST<void>(url, data);
  }

  async update(
    id: string,
    data: IUpdateFertilizacion,
  ): Promise<IFertilizacion> {
    const url = `${API_DATOS}/fertilizacions/${id}`;
    return await this.axios.PUT<IFertilizacion>(url, data);
  }

  async delete(id: string): Promise<IFertilizacion> {
    const url = `${API_DATOS}/fertilizacions/${id}`;
    return await this.axios.DELETE<IFertilizacion>(url);
  }
}
