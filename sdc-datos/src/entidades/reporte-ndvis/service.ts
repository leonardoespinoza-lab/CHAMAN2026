import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ICreateReporteNDVI,
  IQueryParam,
  IUpdateReporteNDVI,
} from 'modelos/src';
import { ReporteNDVIsRepository } from './repository';

@Injectable()
export class ReporteNDVIsService {
  constructor(private repository: ReporteNDVIsRepository) {}

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

  async getLastByIdProductor(idProductor: string) {
    return await this.repository.getLastByIdProductor(idProductor);
  }

  async getLastByIdDistribuidor(idDistribuidor: string) {
    return await this.repository.getLastByIdDistribuidor(idDistribuidor);
  }

  async getLastByIdLote(idLote: string) {
    return await this.repository.getLastByIdLote(idLote);
  }

  async getLastByLote() {
    return await this.repository.getLast();
  }

  async create(dato: ICreateReporteNDVI) {
    return await this.repository.create(dato);
  }

  async update(id: string, dato: IUpdateReporteNDVI) {
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

  async deleteMany(query: IQueryParam) {
    return await this.repository.deleteMany(query);
  }
}
