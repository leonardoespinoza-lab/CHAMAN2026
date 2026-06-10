import { Injectable } from '@nestjs/common';
import { ISemilla, IListado, IQueryParam } from 'modelos/src';
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
}
