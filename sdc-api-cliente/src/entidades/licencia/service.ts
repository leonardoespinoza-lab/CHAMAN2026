import { Injectable } from '@nestjs/common';
import {
  ILicencia,
  IListado,
  IQueryParam,
  ICreateLicencia,
  IUpdateLicencia,
  IUsuario,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { LicenciasRepository } from './repository';

@Injectable()
export class LicenciasService {
  constructor(private repository: LicenciasRepository) {}

  async getById(id: string): Promise<ILicencia> {
    return await this.repository.getById(id);
  }

  async get(filtro: IQueryParam, user: IUsuario): Promise<IListado<ILicencia>> {
    this.agregarFiltroPermisos(filtro, user);
    return await this.repository.get(filtro);
  }

  async getInternal(filtro: IQueryParam): Promise<IListado<ILicencia>> {
    return await this.repository.get(filtro);
  }

  async create(data: ICreateLicencia): Promise<ILicencia> {
    return await this.repository.create(data);
  }

  async update(id: string, data: IUpdateLicencia): Promise<ILicencia> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<ILicencia> {
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
    const licenciaesUsuario = user.permisos
      .filter((p) => p.nivel === 'Establecimiento')
      .map((p) => p.idEstablecimiento);

    if (productoresUsusario.length > 0) {
      $or.push({ idProductor: { $in: productoresUsusario } });
    }
    if (licenciaesUsuario.length > 0) {
      $or.push({ _id: { $in: licenciaesUsuario } });
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
