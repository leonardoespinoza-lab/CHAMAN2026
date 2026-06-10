import { Injectable } from '@nestjs/common';
import {
  IProductor,
  IQueryParam,
  ICreateProductor,
  IUpdateProductor,
  IFilter,
  IApikey,
} from 'modelos/src';
import { ProductorsRepository } from './repository';
import { CreateProducer } from '../../endpoints/schemas';

@Injectable()
export class ProductorsService {
  constructor(private repository: ProductorsRepository) {}

  async getById(id: string): Promise<IProductor> {
    return await this.repository.getById(id);
  }

  async create(data: ICreateProductor): Promise<IProductor> {
    return await this.repository.create(data);
  }

  async update(id: string, data: IUpdateProductor): Promise<IProductor> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IProductor> {
    return await this.repository.delete(id);
  }

  async getOrCreate(
    body: CreateProducer,
    apikey: IApikey,
  ): Promise<IProductor> {
    const filter: IFilter<IProductor> = {
      nombre: body.nombre,
      idDistribuidor: apikey.permiso.idDistribuidor,
    };
    const query: IQueryParam = { filter: JSON.stringify(filter), limit: 1 };
    const establecimientos = await this.repository.get(query);
    const existe = establecimientos.datos[0];
    if (existe) {
      return existe;
    }

    const create: ICreateProductor = {
      nombre: body.nombre,
      idDistribuidor: apikey.permiso.idDistribuidor,
      idQuimica: apikey.permiso.idQuimica,
    };
    return await this.create(create);
  }
}
