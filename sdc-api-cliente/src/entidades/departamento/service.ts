import { Injectable } from '@nestjs/common';
import {
  IDepartamento,
  ICreateDepartamento,
  IListado,
  IQueryParam,
  IUpdateDepartamento,
} from 'modelos/src';
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

  async create(data: ICreateDepartamento): Promise<IDepartamento> {
    return await this.repository.create(data);
  }

  async bulk(data: ICreateDepartamento[]): Promise<void> {
    return await this.repository.bulk(data);
  }

  async update(id: string, data: IUpdateDepartamento): Promise<IDepartamento> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IDepartamento> {
    return await this.repository.delete(id);
  }
}
