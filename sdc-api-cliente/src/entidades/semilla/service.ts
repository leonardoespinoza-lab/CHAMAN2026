import { Injectable } from '@nestjs/common';
import { ISemilla, IListado, IQueryParam, ICreateSemilla, IUpdateSemilla } from 'modelos/src';
import { SemillasRepository } from './repository';

@Injectable()
export class SemillasService {
  constructor(private repository: SemillasRepository) {}

  async getById(id: string): Promise<ISemilla> {
    return await this.repository.getById(id);
  }

  async get(filtro: IQueryParam): Promise<IListado<ISemilla>> {
    return await this.repository.get(filtro);
  }

  async create(data: ICreateSemilla): Promise<ISemilla> {
    return await this.repository.create(data);
  }

  async bulk(data: ICreateSemilla[]): Promise<void> {
    return await this.repository.bulk(data);
  }

  async update(id: string, data: IUpdateSemilla): Promise<ISemilla> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<ISemilla> {
    return await this.repository.delete(id);
  }
}
