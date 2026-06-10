import { Injectable } from '@nestjs/common';
import { IQuimica, IListado, IQueryParam } from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class QuimicasRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IQuimica> {
    const url = `${API_DATOS}/quimicas/${id}`;
    return await this.axios.GET<IQuimica>(url);
  }

  async get(params: IQueryParam): Promise<IListado<IQuimica>> {
    const url = `${API_DATOS}/quimicas`;
    return await this.axios.GET<IListado<IQuimica>>(url, { params });
  }
}
