import { Injectable } from '@nestjs/common';
import {
  IAlerta,
  ICreateAlerta,
  IListado,
  IQueryParam,
  IUpdateAlerta,
  IUsuario,
  IFilter,
  IEstadoAlerta,
  IPermiso,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { AlertasRepository } from './repository';

@Injectable()
export class AlertasService {
  constructor(private repository: AlertasRepository) {}

  async getById(id: string, permiso: IPermiso): Promise<IAlerta> {
    const data = await this.repository.getById(id);
    if (!this.puedeVer(data, permiso)) {
      throw new Error('No tiene permiso para ver esta alerta');
    }
    return data;
  }

  async get(query: IQueryParam, permiso: IPermiso): Promise<IListado<IAlerta>> {
    this.agregarFiltroPermiso(query, permiso);
    return await this.repository.get(query);
  }

  async getByIdSiembra(
    idSiembra: string,
    permiso: IPermiso,
  ): Promise<IListado<IAlerta>> {
    const filter: IFilter<IAlerta> = { idSiembra };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
    };
    this.agregarFiltroPermiso(query, permiso);
    return await this.repository.get(query);
  }

  async getUltimaActivaByIdSiembra(
    idSiembra: string,
    permiso: IPermiso,
  ): Promise<IAlerta> {
    const filter: IFilter<IAlerta> = { idSiembra, activa: true };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      limit: 1,
    };
    this.agregarFiltroPermiso(query, permiso);
    const res = await this.repository.get(query);
    return res.datos[0];
  }

  async create(data: ICreateAlerta): Promise<IAlerta> {
    return await this.repository.create(data);
  }

  async bulk(data: ICreateAlerta[]): Promise<void> {
    return await this.repository.bulk(data);
  }

  async update(
    id: string,
    data: IUpdateAlerta,
    permiso: IPermiso,
  ): Promise<IAlerta> {
    await this.getById(id, permiso);
    return await this.repository.update(id, data);
  }

  async cambiarEstado(
    id: string,
    data: { estado: IEstadoAlerta; activa: boolean },
    user: IUsuario,
    permiso: IPermiso,
  ): Promise<IAlerta> {
    const alerta = await this.getById(id, permiso);
    const estados = alerta.estados || [];
    const estado: IEstadoAlerta = {
      fecha: new Date().toISOString(),
      idUsuario: user._id,
      //Espredea el las keys del objeto, un capo.
      ...data.estado,
    };
    estados.push(estado);
    const update: IUpdateAlerta = {
      estados,
      estadoActual: estado.estado,
      activa: data.activa,
    };
    return await this.repository.update(id, update);
  }

  async delete(id: string, permiso: IPermiso): Promise<IAlerta> {
    await this.getById(id, permiso);
    return await this.repository.delete(id);
  }

  // Private

  private puedeVer(data: IAlerta, permiso: IPermiso): boolean {
    if (permiso.nivel === 'Admin') {
      return true;
    }
    if (permiso.nivel === 'Quimica') {
      return data.idQuimica === permiso.idQuimica;
    }
    if (permiso.nivel === 'Distribuidor') {
      return data.idDistribuidor === permiso.idDistribuidor;
    }
    if (permiso.nivel === 'Productor') {
      return data.idProductor === permiso.idProductor;
    }
    if (permiso.nivel === 'Establecimiento') {
      return data.idEstablecimiento === permiso.idEstablecimiento;
    }
    return false;
  }

  private agregarFiltroPermiso(query: IQueryParam, permiso: IPermiso) {
    const filtro: IFilter<IAlerta> = HelperService.filtroToObject(query.filter);
    const $and = filtro.$and || [];

    if (permiso.nivel === 'Quimica') {
      $and.push({ idQuimica: permiso.idQuimica });
    }
    if (permiso.nivel === 'Distribuidor') {
      $and.push({ idDistribuidor: permiso.idDistribuidor });
    }
    if (permiso.nivel === 'Productor') {
      $and.push({ idProductor: permiso.idProductor });
    }
    if (permiso.nivel === 'Establecimiento') {
      $and.push({ idEstablecimiento: permiso.idEstablecimiento });
    }

    if ($and.length > 0) {
      filtro.$and = $and;
      query.filter = JSON.stringify(filtro);
    }
  }
}
