import { Injectable, NotFoundException } from '@nestjs/common';
import { ICreateFoto, IQueryParam, IUpdateFoto } from 'modelos/src';
import { FotosRepository } from './repository';

@Injectable()
export class FotosService {
  constructor(private repository: FotosRepository) {}

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

  async create(dato: ICreateFoto) {
    return await this.repository.create(dato);
  }

  async update(id: string, dato: IUpdateFoto) {
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
