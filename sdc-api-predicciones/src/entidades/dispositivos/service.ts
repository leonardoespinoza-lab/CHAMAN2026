import { Injectable } from '@nestjs/common';
import {
  IDispositivo,
  IListado,
  IQueryParam,
  ICreateDispositivo,
  IUpdateDispositivo,
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
