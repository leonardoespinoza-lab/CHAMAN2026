import { Injectable } from '@nestjs/common';
import { IQueryParam } from 'modelos/src';
import { IaMalezaAnalisis } from './modelos/schema';
import { IaMalezasRepository } from './repository';

@Injectable()
export class IaMalezasService {
  constructor(private repository: IaMalezasRepository) {}

  async getById(id: string): Promise<IaMalezaAnalisis> {
    return await this.repository.getById(id);
  }

  async getFilter(query: IQueryParam) {
    return await this.repository.getFilter(query);
  }

  async create(data: Partial<IaMalezaAnalisis>): Promise<IaMalezaAnalisis> {
    return await this.repository.create(data);
  }

  async update(
    id: string,
    data: Partial<IaMalezaAnalisis>,
  ): Promise<IaMalezaAnalisis> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IaMalezaAnalisis> {
    return await this.repository.delete(id);
  }
}
