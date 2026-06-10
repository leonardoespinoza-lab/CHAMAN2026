import { Injectable } from '@nestjs/common';
import {
  IReporteNDVI,
  ICreateReporteNDVI,
  IListado,
  IQueryParam,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class ReporteNDVIRepository {
  constructor(private axios: AxiosService) {}

  async getFiltered(params: IQueryParam): Promise<IListado<IReporteNDVI>> {
    const url = `${API_DATOS}/reportendvis`;
    return await this.axios.GET<IListado<IReporteNDVI>>(url, { params });
  }

  async getLast(): Promise<IListado<IReporteNDVI>> {
    const url = `${API_DATOS}/reportendvis/lastByLote`;
    return await this.axios.GET<IListado<IReporteNDVI>>(url);
  }

  async getById(key: string): Promise<IReporteNDVI> {
    const url = `${API_DATOS}/reportendvis/reportendvi/${key}`;
    return await this.axios.GET<IReporteNDVI>(url);
  }

  async create(data: ICreateReporteNDVI): Promise<IReporteNDVI> {
    const url = `${API_DATOS}/reportendvis`;
    return await this.axios.POST<IReporteNDVI>(url, data);
  }
}
