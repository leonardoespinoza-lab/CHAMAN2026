import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ICreateEstablecimiento,
  IQueryParam,
  IUpdateEstablecimiento,
} from 'modelos/src';
import { EstablecimientosRepository } from './repository';

@Injectable()
export class EstablecimientosService {
  constructor(private repository: EstablecimientosRepository) {}

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

  async create(dato: ICreateEstablecimiento) {
    return await this.repository.create(dato);
  }

  async update(id: string, dato: IUpdateEstablecimiento) {
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
