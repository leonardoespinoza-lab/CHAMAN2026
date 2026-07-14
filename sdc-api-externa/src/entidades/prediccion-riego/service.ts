import { Injectable } from '@nestjs/common';
import {
  IPrediccionRiego,
  ICreatePrediccionRiego,
  IListado,
  IQueryParam,
  IUpdatePrediccionRiego,
  IFilter,
  IPopulate,
  IEntradasAgronomicasSuelo,
} from 'modelos/src';
import { PrediccionRiegoRepository } from './repository';

@Injectable()
export class PrediccionRiegoService {
  constructor(private repository: PrediccionRiegoRepository) {}

  async getById(id: string): Promise<IPrediccionRiego> {
    return await this.repository.getById(id);
  }

  async get(filtro: IQueryParam): Promise<IListado<IPrediccionRiego>> {
    return await this.repository.get(filtro);
  }

  async create(data: ICreatePrediccionRiego): Promise<IPrediccionRiego> {
    return await this.repository.create(data);
  }

  async update(
    id: string,
    data: IUpdatePrediccionRiego,
  ): Promise<IPrediccionRiego> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IPrediccionRiego> {
    return await this.repository.delete(id);
  }

  async getAgronomicInputsByLot(
    idLote: string,
  ): Promise<IEntradasAgronomicasSuelo | null> {
    return await this.repository.getAgronomicInputsByLot(idLote);
  }

  async getBySiembraYFecha(
    idSiembra: string,
    fecha?: string,
  ): Promise<IPrediccionRiego> {
    const populate: IPopulate = [
      {
        path: 'lote',
        select: '_id nombre puntoMarchitez capacidadDeCampo',
      },
    ];
    const filter: IFilter<IPrediccionRiego> = {
      idSiembra,
    };
    if (fecha) {
      filter.fechaPrediccion = fecha;
    }

    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      populate: JSON.stringify(populate),
      sort: '-fechaPrediccion',
      limit: 1,
    };
    const predicciones = await this.get(query);
    return predicciones.datos[0];
  }
}
