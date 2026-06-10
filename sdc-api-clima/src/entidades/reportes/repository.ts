import { Injectable } from '@nestjs/common';
import { IReporte, IListado, IQueryParam } from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class ReportesRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IReporte> {
    const url = `${API_DATOS}/reportes/${id}`;
    return await this.axios.GET<IReporte>(url);
  }

  async get(params: IQueryParam): Promise<IListado<IReporte>> {
    const url = `${API_DATOS}/reportes`;
    return await this.axios.GET<IListado<IReporte>>(url, { params });
  }
}
