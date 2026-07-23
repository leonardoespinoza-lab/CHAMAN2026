import { Injectable, NotFoundException } from '@nestjs/common';
import { ICreateVisitaLote, IQueryParam, IUpdateVisitaLote } from 'modelos/src';
import { VisitasLoteRepository } from './repository';

@Injectable()
export class VisitasLoteService {
  constructor(private repository: VisitasLoteRepository) {}

  async getFilter(query: IQueryParam) {
    return await this.repository.getFilter(query);
  }

  async getById(id: string) {
    const data = await this.repository.getById(id);
    if (!data) throw new NotFoundException('Visita no encontrada');
    return data;
  }

  async create(data: ICreateVisitaLote) {
    return await this.repository.create(data);
  }

  async update(id: string, data: IUpdateVisitaLote) {
    const updated = await this.repository.update(id, data);
    if (!updated) throw new NotFoundException('Visita no encontrada');
    return updated;
  }
}
