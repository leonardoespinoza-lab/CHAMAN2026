import { Injectable } from '@nestjs/common';
import {
  IFilter,
  IListado,
  ILote,
  IQueryParam,
  IUpdateLote,
} from 'modelos/src';
import { LotesRepository } from './repository';

@Injectable()
export class LotesService {
  constructor(private repository: LotesRepository) {}

  async update(id: string, data: IUpdateLote): Promise<ILote> {
    return await this.repository.update(id, data);
  }

  async get(filtro: IQueryParam): Promise<IListado<ILote>> {
    return await this.repository.get(filtro);
  }

  async getByIdSonda(idSondaSuelo: string): Promise<ILote[]> {
    const filter: IFilter<ILote> = { idSondaSuelo };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      select: 'nombre',
    };
    return (await this.repository.get(query)).datos;
  }
}
