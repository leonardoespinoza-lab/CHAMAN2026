import { Injectable } from '@nestjs/common';
import { IListado, IQueryParam } from 'modelos/src';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { API_DATOS } from '../../env';
import { IaMalezaAnalisis } from './types';

@Injectable()
export class IaMalezasRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IaMalezaAnalisis> {
    const url = `${API_DATOS}/ia-malezas/${id}`;
    return await this.axios.GET<IaMalezaAnalisis>(url);
  }

  async get(params: IQueryParam): Promise<IListado<IaMalezaAnalisis>> {
    const url = `${API_DATOS}/ia-malezas`;
    return await this.axios.GET<IListado<IaMalezaAnalisis>>(url, { params });
  }

  async create(data: Partial<IaMalezaAnalisis>): Promise<IaMalezaAnalisis> {
    const url = `${API_DATOS}/ia-malezas`;
    return await this.axios.POST<IaMalezaAnalisis>(url, data);
  }

  async update(
    id: string,
    data: Partial<IaMalezaAnalisis>,
  ): Promise<IaMalezaAnalisis> {
    const url = `${API_DATOS}/ia-malezas/${id}`;
    return await this.axios.PUT<IaMalezaAnalisis>(url, data);
  }

  async delete(id: string): Promise<IaMalezaAnalisis> {
    const url = `${API_DATOS}/ia-malezas/${id}`;
    return await this.axios.DELETE<IaMalezaAnalisis>(url);
  }
}
