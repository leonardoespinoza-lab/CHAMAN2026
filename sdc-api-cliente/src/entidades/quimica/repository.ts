import { Injectable } from '@nestjs/common';
import {
  IQuimica,
  IListado,
  IQueryParam,
  ICreateQuimica,
  IUpdateQuimica,
  ISolicitudArchivado,
} from 'modelos/src';
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

  async create(data: ICreateQuimica): Promise<IQuimica> {
    const url = `${API_DATOS}/quimicas`;
    return await this.axios.POST<IQuimica>(url, data);
  }

  async update(id: string, data: IUpdateQuimica): Promise<IQuimica> {
    const url = `${API_DATOS}/quimicas/${id}`;
    return await this.axios.PUT<IQuimica>(url, data);
  }

  async delete(id: string, audit: ISolicitudArchivado = {}): Promise<IQuimica> {
    const url = `${API_DATOS}/quimicas/${id}`;
    return await this.axios.DELETE<IQuimica>(url, { params: audit });
  }
}
