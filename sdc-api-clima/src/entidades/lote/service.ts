import { Injectable } from '@nestjs/common';
import {
  ILote,
  IListado,
  IQueryParam,
  ICreateLote,
  IUpdateLote,
} from 'modelos/src';
import { LotesRepository } from './repository';

@Injectable()
export class LotesService {
  constructor(private repository: LotesRepository) {}

  async getById(id: string): Promise<ILote> {
    return await this.repository.getById(id);
  }

  async get(filtro: IQueryParam): Promise<IListado<ILote>> {
    return await this.repository.get(filtro);
  }

  async create(data: ICreateLote): Promise<ILote> {
    return await this.repository.create(data);
  }

  async update(id: string, data: IUpdateLote): Promise<ILote> {
    // Solo updateo por el semáforo

    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<ILote> {
    return await this.repository.delete(id);
  }
}
