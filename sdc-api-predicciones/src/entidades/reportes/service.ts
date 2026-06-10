import { Injectable } from '@nestjs/common';
import { IReporte, IListado, IQueryParam, IFilter } from 'modelos/src';
import { ReportesRepository } from './repository';

@Injectable()
export class ReportesService {
  constructor(private repository: ReportesRepository) {}

  async getById(id: string): Promise<IReporte> {
    return await this.repository.getById(id);
  }

  async get(filtro: IQueryParam): Promise<IListado<IReporte>> {
    return await this.repository.get(filtro);
  }

  async getByIdEntreFechas(
    id: string,
    from: string,
    to: string,
  ): Promise<IReporte[]> {
    const filter: IFilter<IReporte> = {
      _id: id,
      fecha: { $gte: from, $lte: to },
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      sort: '-fecha',
      limit: 0,
    };
    const res = await this.get(query);
    return res.datos;
  }
}
