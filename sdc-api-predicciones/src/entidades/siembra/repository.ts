import { Injectable } from '@nestjs/common';
import { ISiembra, IListado, IQueryParam, IUpdateSiembra } from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class SiembrasRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<ISiembra> {
    const url = `${API_DATOS}/siembras/${id}`;
    return await this.axios.GET<ISiembra>(url);
  }

  async get(params: IQueryParam): Promise<IListado<ISiembra>> {
    const url = `${API_DATOS}/siembras`;
    return await this.axios.GET<IListado<ISiembra>>(url, { params });
  }

  async update(id: string, data: IUpdateSiembra): Promise<ISiembra> {
    const url = `${API_DATOS}/siembras/${id}`;
    return await this.axios.PUT<ISiembra>(url, data);
  }
}
