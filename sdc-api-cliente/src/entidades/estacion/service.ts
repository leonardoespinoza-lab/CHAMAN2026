import { Injectable } from '@nestjs/common';
import {
  IEstacion,
  ICreateEstacion,
  IListado,
  IQueryParam,
  IUpdateEstacion,
} from 'modelos/src';
import { EstacionsRepository } from './repository';
import { HelperService } from '../../auxiliares/helper';

@Injectable()
export class EstacionsService {
  constructor(private repository: EstacionsRepository) {}

  async getById(id: string): Promise<IEstacion> {
    return await this.repository.getById(id);
  }

  async getFiltered(query: IQueryParam): Promise<IListado<IEstacion>> {
    return await this.repository.getFiltered(query);
  }

  async create(data: ICreateEstacion): Promise<IEstacion> {
    return await this.repository.create(data);
  }

  async update(id: string, data: IUpdateEstacion): Promise<IEstacion> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IEstacion> {
    return await this.repository.delete(id);
  }

  //

  async getSueloFiltered(query: IQueryParam): Promise<IListado<IEstacion>> {
    this.agregarFiltroSuelo(query);
    return await this.repository.getFiltered(query);
  }

  // Private
  private agregarFiltroSuelo(query: IQueryParam): void {
    const filter = HelperService.filtroToObject(query.filtro);
    filter[`meta.soilTemp`] = { $exists: true };
    filter[`meta.volumetricAverage`] = { $exists: true };
    query.filtro = JSON.stringify(filter);
  }
}
