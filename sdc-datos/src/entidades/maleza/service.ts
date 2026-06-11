import { Injectable, NotFoundException } from '@nestjs/common';
import { ICreateMaleza, IQueryParam, IUpdateMaleza } from 'modelos/src';
import { MalezasRepository } from './repository';

@Injectable()
export class MalezasService {
  constructor(private repository: MalezasRepository) {}

  async getFilter(query: IQueryParam) {
    return await this.repository.getFilter(query);
  }

  async getById(id: string) {
    const data = await this.repository.getById(id);
    if (data) return data;
    throw new NotFoundException('No encontrado');
  }

  async create(dato: ICreateMaleza) {
    return await this.repository.create(dato);
  }

  async bulk(data: ICreateMaleza[]) {
    return await this.repository.bulk(data);
  }

  async update(id: string, dato: IUpdateMaleza) {
    const updated = await this.repository.update(id, dato);
    if (updated) return updated;
    throw new NotFoundException('No encontrado');
  }

  async delete(id: string) {
    const deleted = await this.repository.delete(id);
    if (deleted) return deleted;
    throw new NotFoundException('No encontrado');
  }
}
