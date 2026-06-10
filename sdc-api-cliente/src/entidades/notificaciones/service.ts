import { Injectable } from '@nestjs/common';
import {
  IQueryParam,
  INotificacion,
  IUpdateNotificacion,
  IListado,
  IFilter,
  IUsuario,
} from 'modelos/src';
import { NotificacionesRopository } from './repository';
import { HelperService } from '../../auxiliares/helper';

@Injectable()
export class NotificacionesService {
  constructor(private repository: NotificacionesRopository) {}

  async getById(id: string, user: IUsuario): Promise<INotificacion> {
    const notif = await this.repository.getById(id);
    if (!this.puedeVer(notif, user)) {
      throw new Error('No tiene permiso para ver esta notificación');
    }
    return notif;
  }

  async getFiltered(
    query: IQueryParam,
    user: IUsuario,
  ): Promise<IListado<INotificacion>> {
    this.agregarFiltroPermiso(query, user);
    return await this.repository.getFiltered(query);
  }

  async update(
    id: string,
    datos: IUpdateNotificacion,
    user: IUsuario,
  ): Promise<INotificacion> {
    await this.getById(id, user); // Verifica que el usuario tenga permiso para ver la notificación
    return await this.repository.update(id, datos);
  }

  async marcarLeidos(user: IUsuario): Promise<INotificacion> {
    const filter: IFilter<INotificacion> = {
      'tenant.idUsuario': user._id,
      leido: false,
    } as any;
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
    };
    const datos: IUpdateNotificacion = {
      leido: true,
    };
    return await this.repository.updateMany(query, datos);
  }

  async eliminar(id: string, user: IUsuario): Promise<INotificacion> {
    await this.getById(id, user); // Ver
    return await this.repository.delete(id);
  }

  // Private

  private puedeVer(data: INotificacion, user: IUsuario): boolean {
    return user._id === data.tenant?.idUsuario;
  }

  private agregarFiltroPermiso(params: IQueryParam, user: IUsuario) {
    const filtro = HelperService.filtroToObject(params.filter);
    filtro['tenant.idUsuario'] = user._id;
    params.filter = JSON.stringify(filtro);
  }
}
