import { Injectable } from '@nestjs/common';
import {
  IEstablecimiento,
  IListado,
  IQueryParam,
  ICreateEstablecimiento,
  IUpdateEstablecimiento,
} from 'modelos/src';
import { AGROMETEO_INTERNAL_TOKEN, API_CLIMA, API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class EstablecimientosRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IEstablecimiento> {
    const url = `${API_DATOS}/establecimientos/${id}`;
    return await this.axios.GET<IEstablecimiento>(url);
  }

  async get(params: IQueryParam): Promise<IListado<IEstablecimiento>> {
    const url = `${API_DATOS}/establecimientos`;
    return await this.axios.GET<IListado<IEstablecimiento>>(url, { params });
  }

  async create(data: ICreateEstablecimiento): Promise<IEstablecimiento> {
    const url = `${API_DATOS}/establecimientos`;
    return await this.axios.POST<IEstablecimiento>(url, data);
  }

  async update(
    id: string,
    data: IUpdateEstablecimiento,
  ): Promise<IEstablecimiento> {
    const url = `${API_DATOS}/establecimientos/${id}`;
    return await this.axios.PUT<IEstablecimiento>(url, data);
  }

  async delete(id: string): Promise<IEstablecimiento> {
    const url = `${API_DATOS}/establecimientos/${id}`;
    return await this.axios.DELETE<IEstablecimiento>(url);
  }

  async reprocesarAgrometeorologia(id: string): Promise<void> {
    const url = `${API_CLIMA}/agrometeorologia/establecimientos/${id}/reprocesar`;
    await this.axios.POST<void>(
      url,
      {},
      {
        headers: AGROMETEO_INTERNAL_TOKEN
          ? { 'x-chaman-internal-token': AGROMETEO_INTERNAL_TOKEN }
          : {},
      },
    );
  }
}
