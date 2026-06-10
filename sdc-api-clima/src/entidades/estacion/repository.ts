import { Injectable } from '@nestjs/common';
import { BulkWriteResult, IEstacion, IListado, IQueryParam } from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class EstacionsRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IEstacion> {
    const url = `${API_DATOS}/estacions/${id}`;
    return await this.axios.GET<IEstacion>(url);
  }

  async getFiltered(params: IQueryParam): Promise<IListado<IEstacion>> {
    const url = `${API_DATOS}/estacions`;
    return await this.axios.GET<IListado<IEstacion>>(url, { params });
  }

  async upsertMany(estaciones: IEstacion[]): Promise<BulkWriteResult> {
    const url = `${API_DATOS}/estacions/upsert/many`;
    return await this.axios.POST<BulkWriteResult>(url, estaciones);
  }
}
