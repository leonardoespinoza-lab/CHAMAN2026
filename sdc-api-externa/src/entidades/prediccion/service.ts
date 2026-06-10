import { Injectable } from '@nestjs/common';
import { IFilter, IListado, IPrediccion, IQueryParam } from 'modelos/src';
import { PrediccionsRepository } from './repository';

@Injectable()
export class PrediccionsService {
  constructor(private repository: PrediccionsRepository) {}

  async get(filtro: IQueryParam): Promise<IListado<IPrediccion>> {
    return await this.repository.get(filtro);
  }

  async deleteByIdSiembra(idSiembra: string): Promise<void> {
    return await this.repository.deleteByIdSiembra(idSiembra);
  }

  async prediccion(idSiembra: string): Promise<IPrediccion[]> {
    return await this.repository.prediccion(idSiembra);
  }

  async getBySiembraYFecha(
    idSiembra: string,
    fecha?: string,
  ): Promise<IPrediccion> {
    const filter: IFilter<IPrediccion> = {
      idSiembra,
    };
    if (fecha) {
      filter.fechaPrediccion = fecha;
    }

    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      sort: '-fechaPrediccion',
      limit: 1,
    };
    const predicciones = await this.get(query);
    return predicciones.datos[0];
  }
}
