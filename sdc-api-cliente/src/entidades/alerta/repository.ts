import { Injectable } from '@nestjs/common';
import {
  IAlerta,
  ICreateAlerta,
  IListado,
  IQueryParam,
  IUpdateAlerta,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class AlertasRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IAlerta> {
    const url = `${API_DATOS}/alertas/${id}`;
    return await this.axios.GET<IAlerta>(url);
  }

  async getByNombre(nombre: string): Promise<IAlerta> {
    const url = `${API_DATOS}/alertas/nombre/${nombre}`;
    return await this.axios.GET<IAlerta>(url);
  }

  async get(filtro: IQueryParam): Promise<IListado<IAlerta>> {
    const url = `${API_DATOS}/alertas`;
    return await this.axios.GET<IListado<IAlerta>>(url, {
      params: filtro,
    });
  }

  async create(data: ICreateAlerta): Promise<IAlerta> {
    const url = `${API_DATOS}/alertas`;
    return await this.axios.POST<IAlerta>(url, data);
  }

  async bulk(data: ICreateAlerta[]): Promise<void> {
    const url = `${API_DATOS}/alertas/bulk`;
    return await this.axios.POST<void>(url, data);
  }

  async update(id: string, data: IUpdateAlerta): Promise<IAlerta> {
    const url = `${API_DATOS}/alertas/${id}`;
    return await this.axios.PUT<IAlerta>(url, data);
  }

  async delete(id: string): Promise<IAlerta> {
    const url = `${API_DATOS}/alertas/${id}`;
    return await this.axios.DELETE<IAlerta>(url);
  }
}
