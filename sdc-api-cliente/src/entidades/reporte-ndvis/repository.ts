import { Injectable } from '@nestjs/common';
import {
  IReporteNDVI,
  IListado,
  IQueryParam,
  ICreateReporteNDVI,
  IUpdateReporteNDVI,
  DeleteResult,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class ReporteNDVIsRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IReporteNDVI> {
    const url = `${API_DATOS}/reportendvis/${id}`;
    return await this.axios.GET<IReporteNDVI>(url);
  }

  async getLastByLote(id: string): Promise<IReporteNDVI[]> {
    const url = `${API_DATOS}/reportendvis/lastByLote/${id}`;
    return await this.axios.GET<IReporteNDVI[]>(url);
  }

  async getLastByLoteByIdDistribuidor(id: string): Promise<IReporteNDVI[]> {
    const url = `${API_DATOS}/reportendvis/lastByLoteByDistribuidor/${id}`;
    return await this.axios.GET<IReporteNDVI[]>(url);
  }

  async get(params: IQueryParam): Promise<IListado<IReporteNDVI>> {
    const url = `${API_DATOS}/reportendvis`;
    return await this.axios.GET<IListado<IReporteNDVI>>(url, { params });
  }

  async create(data: ICreateReporteNDVI): Promise<IReporteNDVI> {
    const url = `${API_DATOS}/reportendvis`;
    return await this.axios.POST<IReporteNDVI>(url, data);
  }

  async update(id: string, data: IUpdateReporteNDVI): Promise<IReporteNDVI> {
    const url = `${API_DATOS}/reportendvis/${id}`;
    return await this.axios.PUT<IReporteNDVI>(url, data);
  }

  async delete(id: string): Promise<IReporteNDVI> {
    const url = `${API_DATOS}/reportendvis/${id}`;
    return await this.axios.DELETE<IReporteNDVI>(url);
  }

  async deleteMany(params: IQueryParam): Promise<DeleteResult> {
    const url = `${API_DATOS}/reportendvis/`;
    return await this.axios.DELETE<DeleteResult>(url, { params });
  }
}
