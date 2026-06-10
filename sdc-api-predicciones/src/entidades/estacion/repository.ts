import { Injectable } from '@nestjs/common';
import { IEstacion, IListado, IQueryParam, IUpdateEstacion } from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class EstacionsRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IEstacion> {
    const url = `${API_DATOS}/estacions/${id}`;
    return await this.axios.GET<IEstacion>(url);
  }

  async get(params: IQueryParam): Promise<IListado<IEstacion>> {
    const url = `${API_DATOS}/estacions`;
    return await this.axios.GET<IListado<IEstacion>>(url, { params });
  }

  async update(id: string, data: IUpdateEstacion): Promise<IEstacion> {
    const url = `${API_DATOS}/estacions/${id}`;
    return await this.axios.PUT<IEstacion>(url, data);
  }
}
