import { Injectable, NotFoundException } from '@nestjs/common';
import { ICreateApikey, IQueryParam, IUpdateApikey } from 'modelos/src';
import { ApikeysRepository } from './repository';

@Injectable()
export class ApikeysService {
  constructor(private repository: ApikeysRepository) {}

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

  async create(dato: ICreateApikey) {
    return await this.repository.create(dato);
  }

  async update(id: string, dato: IUpdateApikey) {
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
