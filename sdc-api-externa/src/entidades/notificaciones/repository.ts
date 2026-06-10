import { Injectable } from '@nestjs/common';
import {
  INotificacion,
  IListado,
  IQueryParam,
  IUpdateNotificacion,
  ICreateNotificacion,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class NotificacionesRopository {
  constructor(private axios: AxiosService) {}

  async getFiltered(filtro: IQueryParam): Promise<IListado<INotificacion>> {
    const url = `${API_DATOS}/notificacions`;
    return await this.axios.GET<IListado<INotificacion>>(url, {
      params: filtro,
    });
  }

  async getById(id: string): Promise<INotificacion> {
    const url = `${API_DATOS}/notificacions/${id}`;
    return await this.axios.GET<INotificacion>(url);
  }

  async update(id: string, datos: IUpdateNotificacion): Promise<INotificacion> {
    const url = `${API_DATOS}/notificacions/${id}`;
    const notif = await this.axios.PUT<INotificacion>(url, datos);
    return notif;
  }

  async updateMany(
    query: IQueryParam,
    datos: IUpdateNotificacion,
  ): Promise<INotificacion> {
    const url = `${API_DATOS}/notificacions`;
    const notif = await this.axios.PUT<INotificacion>(url, datos, {
      params: query,
    });
    return notif;
  }

  async create(datos: ICreateNotificacion): Promise<INotificacion> {
    const url = `${API_DATOS}/notificacions`;
    return await this.axios.POST<INotificacion>(url, datos);
  }

  async delete(id: string): Promise<INotificacion> {
    const url = `${API_DATOS}/notificacions/${id}`;
    return await this.axios.DELETE<INotificacion>(url);
  }
}
