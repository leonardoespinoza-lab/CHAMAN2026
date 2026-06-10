import { Injectable } from '@nestjs/common';
import {
  ILote,
  IListado,
  IQueryParam,
  ICreateLote,
  IUpdateLote,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class LotesRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<ILote> {
    const url = `${API_DATOS}/lotes/${id}`;
    return await this.axios.GET<ILote>(url);
  }

  async getFiltered(params: IQueryParam): Promise<IListado<ILote>> {
    const url = `${API_DATOS}/lotes`;
    return await this.axios.GET<IListado<ILote>>(url, { params });
  }

  async create(data: ICreateLote): Promise<ILote> {
    const url = `${API_DATOS}/lotes`;
    return await this.axios.POST<ILote>(url, data);
  }

  async update(id: string, data: IUpdateLote): Promise<ILote> {
    const url = `${API_DATOS}/lotes/${id}`;
    return await this.axios.PUT<ILote>(url, data);
  }

  async delete(id: string): Promise<ILote> {
    const url = `${API_DATOS}/lotes/${id}`;
    return await this.axios.DELETE<ILote>(url);
  }
}
