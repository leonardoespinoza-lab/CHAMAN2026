import { Injectable } from '@nestjs/common';
import {
  ICreateMaleza,
  IListado,
  IMaleza,
  IQueryParam,
  IUpdateMaleza,
} from 'modelos/src';
import { MalezasRepository } from './repository';

@Injectable()
export class MalezasService {
  constructor(private repository: MalezasRepository) {}

  async getById(id: string): Promise<IMaleza> {
    return await this.repository.getById(id);
  }

  async get(filtro: IQueryParam): Promise<IListado<IMaleza>> {
    return await this.repository.get(filtro);
  }

  async create(data: ICreateMaleza): Promise<IMaleza> {
    return await this.repository.create(data);
  }

  async bulk(data: ICreateMaleza[]): Promise<void> {
    return await this.repository.bulk(data);
  }

  async update(id: string, data: IUpdateMaleza): Promise<IMaleza> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IMaleza> {
    return await this.repository.delete(id);
  }
}
