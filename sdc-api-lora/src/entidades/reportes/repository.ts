import { Injectable } from '@nestjs/common';
import {
  IReporte,
  ICreateReporte,
  IListado,
  IQueryParam,
  IUpdateReporte,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class ReportesRepository {
  constructor(private axios: AxiosService) {}

  async get(params: IQueryParam): Promise<IListado<IReporte>> {
    const url = `${API_DATOS}/reportes`;
    return await this.axios.GET<IListado<IReporte>>(url, { params });
  }

  async getById(id: string): Promise<IReporte> {
    const url = `${API_DATOS}/reportes/${id}`;
    return await this.axios.GET<IReporte>(url);
  }

  async create(data: ICreateReporte): Promise<IReporte> {
    const url = `${API_DATOS}/reportes`;
    return await this.axios.POST<IReporte>(url, data);
  }

  async update(id: string, data: IUpdateReporte): Promise<IReporte> {
    const url = `${API_DATOS}/reportes/${id}`;
    return await this.axios.PUT<IReporte>(url, data);
  }
}
