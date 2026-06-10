import { Injectable } from '@nestjs/common';
import { INotificacion, IUpdateNotificacion } from 'modelos/src';
import { NotificacionesRopository } from './repository';

@Injectable()
export class NotificacionesService {
  constructor(private repository: NotificacionesRopository) {}

  async getById(id: string): Promise<INotificacion> {
    const notif = await this.repository.getById(id);
    return notif;
  }

  async update(id: string, datos: IUpdateNotificacion): Promise<INotificacion> {
    return await this.repository.update(id, datos);
  }

  async eliminar(id: string): Promise<INotificacion> {
    return await this.repository.delete(id);
  }
}
