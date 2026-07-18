import { Injectable } from '@nestjs/common';
import {
  IPrediccion,
  ISiembra,
  IListado,
  IQueryParam,
  IResumenRiesgosAgroclimaticos,
} from 'modelos/src';
import { API_PREDICCIONES, API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class PrediccionsRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IPrediccion> {
    const url = `${API_DATOS}/prediccions/${id}`;
    return await this.axios.GET<IPrediccion>(url);
  }

  async get(params: IQueryParam): Promise<IListado<IPrediccion>> {
    const url = `${API_DATOS}/prediccions`;
    return await this.axios.GET<IListado<IPrediccion>>(url, { params });
  }

  async deleteByIdSiembra(idSiembra: string): Promise<void> {
    const url = `${API_DATOS}/prediccions/idSiembra/${idSiembra}`;
    return await this.axios.DELETE<void>(url);
  }

  async prediccion(idSiembra: string): Promise<IPrediccion[]> {
    const url = `${API_PREDICCIONES}/prediccions/${idSiembra}`;
    return await this.axios.GET(url);
  }

  async reconstruir(idSiembra: string): Promise<IPrediccion[]> {
    const url = `${API_PREDICCIONES}/prediccions/${idSiembra}/reconstruir`;
    return await this.axios.POST<IPrediccion[]>(url, {});
  }

  async agroclima(idSiembra: string): Promise<IResumenRiesgosAgroclimaticos> {
    const url = `${API_PREDICCIONES}/prediccions/${idSiembra}/agroclima`;
    return await this.axios.GET(url);
  }

  async getSiembraById(idSiembra: string): Promise<ISiembra> {
    const url = `${API_DATOS}/siembras/${idSiembra}`;
    return await this.axios.GET<ISiembra>(url);
  }
}
