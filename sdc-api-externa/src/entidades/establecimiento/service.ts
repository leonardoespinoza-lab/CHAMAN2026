import { Injectable } from '@nestjs/common';
import {
  IEstablecimiento,
  IQueryParam,
  ICreateEstablecimiento,
  IUpdateEstablecimiento,
  IApikey,
  IFilter,
} from 'modelos/src';
import { EstablecimientosRepository } from './repository';

@Injectable()
export class EstablecimientosService {
  constructor(private repository: EstablecimientosRepository) {}

  async getById(id: string): Promise<IEstablecimiento> {
    return await this.repository.getById(id);
  }

  async create(data: ICreateEstablecimiento): Promise<IEstablecimiento> {
    return await this.repository.create(data);
  }

  async update(
    id: string,
    data: IUpdateEstablecimiento,
  ): Promise<IEstablecimiento> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IEstablecimiento> {
    return await this.repository.delete(id);
  }

  //

  async getOrCreateByNombre(
    nombre: string,
    apikey: IApikey,
  ): Promise<IEstablecimiento> {
    const filter: IFilter<IEstablecimiento> = {
      nombre,
      idProductor: apikey.permiso.idProductor,
    };
    const query: IQueryParam = { filter: JSON.stringify(filter), limit: 1 };
    const establecimientos = await this.repository.get(query);
    const existe = establecimientos.datos[0];
    if (existe) {
      return existe;
    }

    const create: ICreateEstablecimiento = {
      nombre,
      idDistribuidor: apikey.permiso.idDistribuidor,
      idQuimica: apikey.permiso.idQuimica,
      idProductor: apikey.permiso.idProductor,
    };
    return await this.create(create);
  }
}
