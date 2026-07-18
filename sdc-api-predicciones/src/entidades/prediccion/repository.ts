import { Injectable } from '@nestjs/common';
import {
  IPrediccion,
  IListado,
  IQueryParam,
  ICreatePrediccion,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class PrediccionsRepository {
  constructor(private axios: AxiosService) {}

  async get(params: IQueryParam): Promise<IListado<IPrediccion>> {
    const url = `${API_DATOS}/prediccions`;
    return await this.axios.GET<IListado<IPrediccion>>(url, { params });
  }

  async create(data: ICreatePrediccion): Promise<IPrediccion> {
    const url = `${API_DATOS}/prediccions`;
    return await this.axios.POST<IPrediccion>(url, data);
  }

  async deleteByIdSiembra(idSiembra: string): Promise<void> {
    const url = `${API_DATOS}/prediccions/idSiembra/${idSiembra}/clear`;
    await this.axios.DELETE<void>(url);
  }

  async restoreByIdSiembra(
    idSiembra: string,
    predicciones: IPrediccion[],
  ): Promise<void> {
    const url = `${API_DATOS}/prediccions/idSiembra/${idSiembra}/restore`;
    await this.axios.POST<void>(url, { predicciones });
  }
}
