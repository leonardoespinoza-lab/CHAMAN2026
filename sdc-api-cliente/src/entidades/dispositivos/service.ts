import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  IDispositivo,
  IListado,
  IQueryParam,
  ICreateDispositivo,
  IUpdateDispositivo,
  IUsuario,
  ModuloPermiso,
  IPermiso,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { DispositivosRepository } from './repository';

@Injectable()
export class DispositivosService {
  constructor(private repository: DispositivosRepository) {}

  async getById(
    id: string,
    user?: IUsuario,
    modulo?: ModuloPermiso,
  ): Promise<IDispositivo> {
    const dispositivo = await this.repository.getById(id);
    if (user && !this.puedeVer(dispositivo, user, modulo)) {
      throw new ForbiddenException('No tiene permiso para ver este dispositivo');
    }
    return dispositivo;
  }

  async assertPuedeVer(
    id: string,
    user: IUsuario,
    modulo?: ModuloPermiso,
  ): Promise<IDispositivo> {
    return await this.getById(id, user, modulo);
  }

  async get(
    filtro: IQueryParam,
    user: IUsuario,
  ): Promise<IListado<IDispositivo>> {
    this.agregarFiltroPermisos(filtro, user);
    return await this.repository.get(filtro);
  }

  async create(data: ICreateDispositivo): Promise<IDispositivo> {
    return await this.repository.create(data);
  }

  async update(id: string, data: IUpdateDispositivo): Promise<IDispositivo> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IDispositivo> {
    return await this.repository.delete(id);
  }

  // Private

  puedeVer(
    dispositivo: IDispositivo,
    user: IUsuario,
    modulo?: ModuloPermiso,
  ): boolean {
    if (!dispositivo || !user?.permisos?.length) {
      return false;
    }

    return user.permisos.some((permiso) => {
      if (!this.puedeVerModulo(permiso, modulo)) {
        return false;
      }
      if (permiso.nivel === 'Admin') {
        return true;
      }
      if (permiso.nivel === 'Quimica') {
        return !!permiso.idQuimica && permiso.idQuimica === dispositivo.idQuimica;
      }
      if (permiso.nivel === 'Distribuidor') {
        return !!permiso.idDistribuidor && permiso.idDistribuidor === dispositivo.idDistribuidor;
      }
      if (permiso.nivel === 'Productor') {
        return !!permiso.idProductor && permiso.idProductor === dispositivo.idProductor;
      }
      if (permiso.nivel === 'Establecimiento') {
        return !!permiso.idEstablecimiento && permiso.idEstablecimiento === dispositivo.idEstablecimiento;
      }
      return false;
    });
  }

  private puedeVerModulo(
    permiso: IPermiso,
    modulo?: ModuloPermiso,
  ): boolean {
    if (!modulo || !permiso.modulos) {
      return true;
    }
    return permiso.modulos[modulo] !== false;
  }

  private agregarFiltroPermisos(params: IQueryParam, user: IUsuario) {
    const filtro = HelperService.filtroToObject(params.filter);
    const $and = filtro.$and || [];
    const $or = [];

    if (user.permisos?.some((p) => p.nivel === 'Admin')) {
      return;
    }

    const quimicasUsuario = user.permisos
      .filter((p) => p.nivel === 'Quimica' && p.idQuimica)
      .map((p) => p.idQuimica);
    const distribuidoresUsuario = user.permisos
      .filter((p) => p.nivel === 'Distribuidor' && p.idDistribuidor)
      .map((p) => p.idDistribuidor);
    const productoresUsuario = user.permisos
      .filter((p) => p.nivel === 'Productor' && p.idProductor)
      .map((p) => p.idProductor);
    const establecimientosUsuario = user.permisos
      .filter((p) => p.nivel === 'Establecimiento' && p.idEstablecimiento)
      .map((p) => p.idEstablecimiento);

    if (quimicasUsuario.length > 0) {
      $or.push({ idQuimica: { $in: quimicasUsuario } });
    }
    if (distribuidoresUsuario.length > 0) {
      $or.push({ idDistribuidor: { $in: distribuidoresUsuario } });
    }
    if (productoresUsuario.length > 0) {
      $or.push({ idProductor: { $in: productoresUsuario } });
    }
    if (establecimientosUsuario.length > 0) {
      $or.push({ idEstablecimiento: { $in: establecimientosUsuario } });
    }
    if ($or.length > 0) {
      $and.push({ $or });
    }
    if ($and.length > 0) {
      filtro.$and = $and;
      params.filter = JSON.stringify(filtro);
    }
  }
}
