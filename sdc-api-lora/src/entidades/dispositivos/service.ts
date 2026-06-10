import { Injectable } from '@nestjs/common';
import {
  IDispositivo,
  IListado,
  IQueryParam,
  ICreateDispositivo,
  IUpdateDispositivo,
  IFilter,
} from 'modelos/src';
import { DispositivosRepository } from './repository';

@Injectable()
export class DispositivosService {
  constructor(private repository: DispositivosRepository) {}

  async getById(id: string): Promise<IDispositivo> {
    return await this.repository.getById(id);
  }

  async get(filtro: IQueryParam): Promise<IListado<IDispositivo>> {
    return await this.repository.get(filtro);
  }

  async getByDeveui(deveui: string): Promise<IDispositivo> {
    const filter: IFilter<IDispositivo> = {
      deveui,
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      limit: 1,
    };
    const res = await this.repository.get(query);
    return res.datos?.length > 0 ? res.datos[0] : null;
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
}
