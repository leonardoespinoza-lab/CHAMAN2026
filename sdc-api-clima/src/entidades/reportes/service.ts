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

  async getByIdDispositivoEntreFechas(
    id: string,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<IListado<IReporte>> {
    const filter: IFilter<IReporte> = {
      idDispositivo: id,
      fecha: {
        $gte: fechaDesde,
        $lte: fechaHasta,
      },
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      limit: 0, // No paginado
    };
    return await this.get(query);
  }
}
