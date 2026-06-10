import { Injectable } from '@nestjs/common';
import {
  IProductor,
  IListado,
  IQueryParam,
  ICreateProductor,
  IUpdateProductor,
  IFilter,
} from 'modelos/src';
import { ProductorsRepository } from './repository';

@Injectable()
export class ProductorsService {
  constructor(private repository: ProductorsRepository) {}

  async getById(id: string): Promise<IProductor> {
    return await this.repository.getById(id);
  }

  async get(filtro: IQueryParam): Promise<IListado<IProductor>> {
    return await this.repository.get(filtro);
  }

  async getByEmail(email: string): Promise<IProductor> {
    const filter: IFilter<IProductor> = {
      nombre: email,
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      limit: 1,
    };
    const res = await this.repository.get(query);
    return res.datos[0];
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
}
