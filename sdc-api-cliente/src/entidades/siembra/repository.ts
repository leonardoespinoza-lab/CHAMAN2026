import { Injectable } from '@nestjs/common';
import {
  ISiembra,
  IListado,
  IQueryParam,
  ICreateSiembra,
  IUpdateSiembra,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class SiembrasRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<ISiembra> {
    const url = `${API_DATOS}/siembras/${id}`;
    return await this.axios.GET<ISiembra>(url);
  }

  async seguimientoHuellaHidrica(id: string): Promise<any> {
    const url = `${API_DATOS}/siembras/${id}/huella-hidrica/seguimiento`;
    return await this.axios.GET<any>(url);
  }

  async get(params: IQueryParam): Promise<IListado<ISiembra>> {
    const url = `${API_DATOS}/siembras`;
    return await this.axios.GET<IListado<ISiembra>>(url, { params });
  }

  async create(data: ICreateSiembra): Promise<ISiembra> {
    const url = `${API_DATOS}/siembras`;
    return await this.axios.POST<ISiembra>(url, data);
  }

  async update(id: string, data: IUpdateSiembra): Promise<ISiembra> {
    const url = `${API_DATOS}/siembras/${id}`;
    return await this.axios.PUT<ISiembra>(url, data);
  }

  async delete(id: string): Promise<ISiembra> {
    const url = `${API_DATOS}/siembras/${id}`;
    return await this.axios.DELETE<ISiembra>(url);
  }
}
