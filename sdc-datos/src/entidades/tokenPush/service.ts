import { Injectable, NotFoundException } from '@nestjs/common';
import { ICreateTokenPush, IQueryParam } from 'modelos/src';
import { TokenPushsRepository } from './repository';

@Injectable()
export class TokenPushsService {
  constructor(private repository: TokenPushsRepository) {}

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

  async create(dato: ICreateTokenPush) {
    return await this.repository.create(dato);
  }

  async upsert(dato: ICreateTokenPush) {
    return await this.repository.upsert(dato);
  }

  async bulk(data: ICreateTokenPush[]) {
    return await this.repository.bulk(data);
  }

  async delete(id: string) {
    const deleted = await this.repository.delete(id);
    if (deleted) {
      return deleted;
    }
    throw new NotFoundException('No encontrado');
  }
}
