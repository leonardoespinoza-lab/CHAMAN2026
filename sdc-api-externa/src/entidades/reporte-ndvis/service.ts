import { Injectable } from '@nestjs/common';
import { ICreateReporteNDVI, IQueryParam, IUpdateReporteNDVI } from 'modelos/src';
import { ReporteNDVIRepository } from './repository';

@Injectable()
export class ReporteNDVIsService {
  constructor(private repository: ReporteNDVIRepository) {}

  async get(params: IQueryParam) {
    return await this.repository.get(params);
  }

  async create(create: ICreateReporteNDVI) {
    return await this.repository.create(create);
  }

  async update(id: string, data: IUpdateReporteNDVI) {
    return await this.repository.update(id, data);
  }
}
