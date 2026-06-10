import { Injectable } from '@nestjs/common';
import { IDepartamento, IListado, IQueryParam } from 'modelos/src';
import { DepartamentosRepository } from './repository';

@Injectable()
export class DepartamentosService {
  constructor(private repository: DepartamentosRepository) {}

  async getById(id: string): Promise<IDepartamento> {
    return await this.repository.getById(id);
  }

  async get(filtro: IQueryParam): Promise<IListado<IDepartamento>> {
    return await this.repository.get(filtro);
  }
}
