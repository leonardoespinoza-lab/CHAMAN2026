import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ICreateDepartamento,
  IQueryParam,
  IUpdateDepartamento,
} from 'modelos/src';
import { DepartamentosRepository } from './repository';

@Injectable()
export class DepartamentosService {
  constructor(private repository: DepartamentosRepository) {}

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

  async create(dato: ICreateDepartamento) {
    return await this.repository.create(dato);
  }

  async bulk(data: ICreateDepartamento[]) {
    return await this.repository.bulk(data);
  }

  async update(id: string, dato: IUpdateDepartamento) {
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
