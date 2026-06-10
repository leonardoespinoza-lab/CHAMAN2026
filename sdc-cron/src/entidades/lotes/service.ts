import { Injectable } from '@nestjs/common';
import {
  ILote,
  IQueryParam,
  ICreateLote,
  IUpdateLote,
  IEstablecimiento,
  IFilter,
  IListado,
} from 'modelos/src';
import { LotesRepository } from './repository';

@Injectable()
export class LotesService {
  constructor(private repository: LotesRepository) {}

  async getById(id: string): Promise<ILote> {
    return await this.repository.getById(id);
  }

  async getFiltered(params: IQueryParam): Promise<IListado<ILote>> {
    return await this.repository.getFiltered(params);
  }

  async create(data: ICreateLote): Promise<ILote> {
    return await this.repository.create(data);
  }

  async update(id: string, data: IUpdateLote): Promise<ILote> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<ILote> {
    return await this.repository.delete(id);
  }
}
