import { Injectable } from '@nestjs/common';
import {
  ISiembra,
  IListado,
  IQueryParam,
  IResultadoPrediccionMalezas,
  IUpdateSiembra,
} from 'modelos/src';
import { SiembrasRepository } from './repository';

@Injectable()
export class SiembrasService {
  constructor(private repository: SiembrasRepository) {}

  async getById(id: string): Promise<ISiembra> {
    return await this.repository.getById(id);
  }

  async get(filtro: IQueryParam): Promise<IListado<ISiembra>> {
    return await this.repository.get(filtro);
  }

  async update(id: string, data: IUpdateSiembra): Promise<ISiembra> {
    return await this.repository.update(id, data);
  }

  async prediccionMalezas(id: string): Promise<IResultadoPrediccionMalezas> {
    return await this.repository.prediccionMalezas(id);
  }

  //

  async listarSiembrasParaPredicciones(): Promise<ISiembra[]> {
    const fechaHace6Meses = new Date();
    fechaHace6Meses.setMonth(fechaHace6Meses.getMonth() - 6);
    const filter = {
      fechaSiembra: {
        $gt: fechaHace6Meses,
      },
      fechaCosecha: { $eq: null },
    };
    const query: IQueryParam = {
      select: '_id',
      filter: JSON.stringify(filter),
    };
    const listado = await this.repository.get(query);
    return listado.datos;
  }

  async listarSiembrasParaMalezas(limit = 250): Promise<ISiembra[]> {
    const fechaHace8Meses = new Date();
    fechaHace8Meses.setMonth(fechaHace8Meses.getMonth() - 8);
    const filter = {
      fechaSiembra: {
        $gt: fechaHace8Meses,
      },
      fechaCosecha: { $eq: null },
    };
    const query: IQueryParam = {
      select: '_id',
      filter: JSON.stringify(filter),
      limit,
    };
    const listado = await this.repository.get(query);
    return listado.datos;
  }
}
