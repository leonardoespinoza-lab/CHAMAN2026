import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ICreateLicenciaPorEntidad,
  IQueryParam,
  IUpdateLicenciaPorEntidad,
} from 'modelos/src';
import { LicenciaPorEntidadsRepository } from './repository';

@Injectable()
export class LicenciaPorEntidadsService {
  constructor(private repository: LicenciaPorEntidadsRepository) {}

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

  async create(dato: ICreateLicenciaPorEntidad) {
    return await this.repository.create(dato);
  }

  async update(id: string, dato: IUpdateLicenciaPorEntidad) {
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
