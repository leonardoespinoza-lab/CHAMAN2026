import { Injectable, NotFoundException } from '@nestjs/common';
import { ICreateFumigacion, IQueryParam, IUpdateFumigacion } from 'modelos/src';
import { FumigacionsRepository } from './repository';

@Injectable()
export class FumigacionsService {
  constructor(private repository: FumigacionsRepository) {}

  async getFilter(query: IQueryParam) {
    return await this.repository.getFilter(query);
  }

  async getById(id: string) {
    const data = await this.repository.getById(id);
    if (data) {
      return data;
    }
    throw new NotFoundException('No encontrado');
  }

  async create(dato: ICreateFumigacion) {
    return await this.repository.create(dato);
  }

  async bulk(data: ICreateFumigacion[]) {
    return await this.repository.bulk(data);
  }

  async update(id: string, dato: IUpdateFumigacion) {
    const updated = await this.repository.update(id, dato);
    if (updated) {
      return updated;
    }
    throw new NotFoundException('No encontrado');
  }

  async delete(id: string) {
    const deleted = await this.repository.delete(id);
    if (deleted) {
      return deleted;
    }
    throw new NotFoundException('No encontrado');
  }
}
