import { Injectable, NotFoundException } from '@nestjs/common';
import { ICreateEstacion, IQueryParam, IUpdateEstacion } from 'modelos/src';
import { EstacionsRepository } from './repository';

@Injectable()
export class EstacionsService {
  constructor(private repository: EstacionsRepository) {}

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

  async create(dato: ICreateEstacion) {
    return await this.repository.create(dato);
  }

  async createMany(data: ICreateEstacion[]) {
    return await this.repository.createMany(data);
  }

  async upsert(dato: ICreateEstacion) {
    return await this.repository.upsert(dato);
  }

  async upsertMany(datos: ICreateEstacion[]) {
    return await this.repository.upsertMany(datos);
  }

  async update(id: string, dato: IUpdateEstacion) {
    const updated = await this.repository.update(id, dato);
    if (updated) {
      return updated;
    }
    throw new NotFoundException('No encontrado');
  }

  async updateMany(query: IQueryParam, data: IUpdateEstacion) {
    return await this.repository.updateMany(query, data);
  }

  async delete(id: string) {
    const deleted = await this.repository.delete(id);
    if (deleted) {
      return deleted;
    }
    throw new NotFoundException('No encontrado');
  }

  async deleteMany(query: IQueryParam) {
    return await this.repository.deleteMany(query);
  }
}
