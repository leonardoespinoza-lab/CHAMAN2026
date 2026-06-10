import { Injectable } from '@nestjs/common';
import {
  IDispositivo,
  IListado,
  IQueryParam,
  ICreateDispositivo,
  IUpdateDispositivo,
  IUsuario,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { DispositivosRepository } from './repository';

@Injectable()
export class DispositivosService {
  constructor(private repository: DispositivosRepository) {}

  async getById(id: string): Promise<IDispositivo> {
    return await this.repository.getById(id);
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

  private agregarFiltroPermisos(params: IQueryParam, user: IUsuario) {
    const filtro = HelperService.filtroToObject(params.filter);
    const $and = filtro.$and || [];
    const $or = [];
    const productoresUsusario = user.permisos
      .filter((p) => p.nivel === 'Productor')
      .map((p) => p.idProductor);
    const dispositivoesUsuario = user.permisos
      .filter((p) => p.nivel === 'Establecimiento')
      .map((p) => p.idEstablecimiento);

    if (productoresUsusario.length > 0) {
      $or.push({ idProductor: { $in: productoresUsusario } });
    }
    if (dispositivoesUsuario.length > 0) {
      $or.push({ _id: { $in: dispositivoesUsuario } });
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
