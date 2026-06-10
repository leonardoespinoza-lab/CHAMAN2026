import { Injectable } from '@nestjs/common';
import { ICreateReporteNDVI, IQueryParam } from 'modelos/src';
import { ReporteNDVIRepository } from './repository';

@Injectable()
export class ReporteNDVIsService {
  constructor(private repository: ReporteNDVIRepository) {}

  async create(create: ICreateReporteNDVI) {
    return await this.repository.create(create);
  }

  async getById(id: string) {
    return await this.repository.getById(id);
  }

  async getFiltered(params: IQueryParam) {
    return await this.repository.getFiltered(params);
  }

  async getLast() {
    return await this.repository.getLast();
  }
}
