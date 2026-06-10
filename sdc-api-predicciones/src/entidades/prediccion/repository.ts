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
}
