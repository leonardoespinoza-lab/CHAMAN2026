import { Injectable } from '@nestjs/common';
import { IEstacion, IListado, IQueryParam, IUpdateEstacion } from 'modelos/src';
import { EstacionsRepository } from './repository';

@Injectable()
export class EstacionsService {
  constructor(private repository: EstacionsRepository) {}

  async getById(id: string): Promise<IEstacion> {
    return await this.repository.getById(id);
  }

  async get(filtro: IQueryParam): Promise<IListado<IEstacion>> {
    return await this.repository.get(filtro);
  }

  async update(id: string, data: IUpdateEstacion): Promise<IEstacion> {
    return await this.repository.update(id, data);
  }
}
