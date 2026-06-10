import { Injectable, NotFoundException } from '@nestjs/common';
import { ICreateReporte, IQueryParam, IUpdateReporte } from 'modelos/src';
import { ReportesRepository } from './repository';

@Injectable()
export class ReportesService {
  constructor(private repository: ReportesRepository) {}

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

  async create(dato: ICreateReporte) {
    return await this.repository.create(dato);
  }

  async update(id: string, dato: IUpdateReporte) {
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
