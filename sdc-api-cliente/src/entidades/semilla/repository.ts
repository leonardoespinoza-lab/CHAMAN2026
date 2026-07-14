import { Injectable } from '@nestjs/common';
import {
  ISemilla,
  IListado,
  IQueryParam,
  ICreateSemilla,
  IUpdateSemilla,
} from 'modelos/src';
import { AGROMETEO_INTERNAL_TOKEN, API_CLIMA, API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class SemillasRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<ISemilla> {
    const url = `${API_DATOS}/semillas/${id}`;
    return await this.axios.GET<ISemilla>(url);
  }

  async get(params: IQueryParam): Promise<IListado<ISemilla>> {
    const url = `${API_DATOS}/semillas`;
    return await this.axios.GET<IListado<ISemilla>>(url, { params });
  }

  async create(data: ICreateSemilla): Promise<ISemilla> {
    const url = `${API_DATOS}/semillas`;
    return await this.axios.POST<ISemilla>(url, data);
  }

  async bulk(data: ICreateSemilla[]): Promise<void> {
    const url = `${API_DATOS}/semillas/bulk`;
    return await this.axios.POST<void>(url, data);
  }

  async update(id: string, data: IUpdateSemilla): Promise<ISemilla> {
    const url = `${API_DATOS}/semillas/${id}`;
    return await this.axios.PUT<ISemilla>(url, data);
  }

  async delete(id: string): Promise<ISemilla> {
    const url = `${API_DATOS}/semillas/${id}`;
    return await this.axios.DELETE<ISemilla>(url);
  }

  async reprocesarAgrometeorologia(id: string): Promise<void> {
    const url = `${API_CLIMA}/agrometeorologia/semillas/${id}/reprocesar`;
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
