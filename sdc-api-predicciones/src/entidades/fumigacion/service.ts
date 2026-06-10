import { Injectable } from '@nestjs/common';
import {
  IFumigacion,
  ICreateFumigacion,
  IListado,
  IQueryParam,
  IUpdateFumigacion,
  IFilter,
} from 'modelos/src';
import { FumigacionsRepository } from './repository';

@Injectable()
export class FumigacionsService {
  constructor(private repository: FumigacionsRepository) {}

  async getById(id: string): Promise<IFumigacion> {
    return await this.repository.getById(id);
  }

  async getByIdSiembra(idSiembra: string): Promise<IListado<IFumigacion>> {
    const filter: IFilter<IFumigacion> = { idSiembra };
    const params: IQueryParam = { filter: JSON.stringify(filter) };
    return await this.repository.get(params);
  }

  async get(filtro: IQueryParam): Promise<IListado<IFumigacion>> {
    return await this.repository.get(filtro);
  }

  async create(data: ICreateFumigacion): Promise<IFumigacion> {
    return await this.repository.create(data);
  }

  async bulk(data: ICreateFumigacion[]): Promise<void> {
    return await this.repository.bulk(data);
  }

  async update(id: string, data: IUpdateFumigacion): Promise<IFumigacion> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IFumigacion> {
    return await this.repository.delete(id);
  }
}
