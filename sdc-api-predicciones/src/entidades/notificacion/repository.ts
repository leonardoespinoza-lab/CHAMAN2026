import { Injectable } from '@nestjs/common';
import {
  ICreateNotificacion,
  IListado,
  INotificacion,
  IQueryParam,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class NotificacionsRepository {
  constructor(private axios: AxiosService) {}

  async create(data: ICreateNotificacion): Promise<INotificacion> {
    const url = `${API_DATOS}/notificacions`;
    return await this.axios.POST<INotificacion>(url, data);
  }

  async getFiltered(params: IQueryParam): Promise<IListado<INotificacion>> {
    const url = `${API_DATOS}/notificacions`;
    return await this.axios.GET<IListado<INotificacion>>(url, { params });
  }
}
