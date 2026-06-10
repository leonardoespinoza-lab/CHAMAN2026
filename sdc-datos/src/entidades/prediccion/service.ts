import { Injectable, NotFoundException } from '@nestjs/common';
import { ICreatePrediccion, IQueryParam, IUpdatePrediccion } from 'modelos/src';
import { PrediccionsRepository } from './repository';

@Injectable()
export class PrediccionsService {
  constructor(private repository: PrediccionsRepository) {}

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

  async create(dato: ICreatePrediccion) {
    return await this.repository.create(dato);
  }

  async update(id: string, dato: IUpdatePrediccion) {
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

  async deleteByIdSiembra(idSiembra: string) {
    await this.repository.deleteByIdSiembra(idSiembra);
  }
}
