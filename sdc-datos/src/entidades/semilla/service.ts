import { Injectable, NotFoundException } from '@nestjs/common';
import { ICreateSemilla, IQueryParam, IUpdateSemilla } from 'modelos/src';
import { SemillasRepository } from './repository';

@Injectable()
export class SemillasService {
  constructor(private repository: SemillasRepository) {}

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

  async create(dato: ICreateSemilla) {
    return await this.repository.create(dato);
  }

  async bulk(data: ICreateSemilla[]) {
    return await this.repository.bulk(data);
  }

  async update(id: string, dato: IUpdateSemilla) {
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
