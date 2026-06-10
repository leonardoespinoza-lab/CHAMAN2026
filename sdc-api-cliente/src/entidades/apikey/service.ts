import { Injectable } from '@nestjs/common';
import {
  IApikey,
  IListado,
  IQueryParam,
  ICreateApikey,
  IUpdateApikey,
  IUsuario,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { ApikeysRepository } from './repository';
import { randomUUID } from 'crypto';

@Injectable()
export class ApikeysService {
  constructor(private repository: ApikeysRepository) {}

  async getById(id: string): Promise<IApikey> {
    return await this.repository.getById(id);
  }

  async get(filtro: IQueryParam, user: IUsuario): Promise<IListado<IApikey>> {
    this.agregarFiltroPermisos(filtro, user);
    return await this.repository.get(filtro);
  }

  async create(data: ICreateApikey): Promise<IApikey> {
    // Genero la key.
    data.key = randomUUID();
    return await this.repository.create(data);
  }

  async update(id: string, data: IUpdateApikey): Promise<IApikey> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IApikey> {
    return await this.repository.delete(id);
  }

  // Private

  private agregarFiltroPermisos(params: IQueryParam, user: IUsuario) {
    const filtro = HelperService.filtroToObject(params.filter);
    const $and = filtro.$and || [];
    const $or = [];
    const productoresUsusario = user.permisos
      .filter((p) => p.nivel === 'Productor')
      .map((p) => p.idProductor);
    const apikeyesUsuario = user.permisos
      .filter((p) => p.nivel === 'Establecimiento')
      .map((p) => p.idEstablecimiento);

    if (productoresUsusario.length > 0) {
      $or.push({ idProductor: { $in: productoresUsusario } });
    }
    if (apikeyesUsuario.length > 0) {
      $or.push({ _id: { $in: apikeyesUsuario } });
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
