import { Injectable } from '@nestjs/common';
import {
  IReporteNDVI,
  ICreateReporteNDVI,
  IUpdateReporteNDVI,
  IListado,
  IQueryParam,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class ReporteNDVIRepository {
  constructor(private axios: AxiosService) {}

  async get(params: IQueryParam): Promise<IListado<IReporteNDVI>> {
    const url = `${API_DATOS}/reportendvis`;
    return await this.axios.GET<IListado<IReporteNDVI>>(url, { params });
  }

  async getById(key: string): Promise<IReporteNDVI> {
    const url = `${API_DATOS}/reportendvis/reportendvi/${key}`;
    return await this.axios.GET<IReporteNDVI>(url);
  }

  async create(data: ICreateReporteNDVI): Promise<IReporteNDVI> {
    const url = `${API_DATOS}/reportendvis`;
    return await this.axios.POST<IReporteNDVI>(url, data);
  }

  async update(id: string, data: IUpdateReporteNDVI): Promise<IReporteNDVI> {
    const url = `${API_DATOS}/reportendvis/${id}`;
    return await this.axios.PUT<IReporteNDVI>(url, data);
  }
}
