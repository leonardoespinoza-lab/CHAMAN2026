import { Injectable } from '@nestjs/common';
import { IFertilizante, IListado, IQueryParam } from 'modelos/src';
import { FertilizantesRepository } from './repository';

@Injectable()
export class FertilizantesService {
  constructor(private repository: FertilizantesRepository) {}

  async getById(id: string): Promise<IFertilizante> {
    return await this.repository.getById(id);
  }

  async get(filtro: IQueryParam): Promise<IListado<IFertilizante>> {
    return await this.repository.get(filtro);
  }
}
