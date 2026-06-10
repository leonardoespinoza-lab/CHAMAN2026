import { Injectable } from '@nestjs/common';
import {
  ICrono,
  ICreateCrono,
  IListado,
  IQueryParam,
  IUpdateCrono,
} from 'modelos/src';
import { CronosRepository } from './repository';

@Injectable()
export class CronosService {
  constructor(private repository: CronosRepository) {}

  async getById(id: string): Promise<ICrono> {
    return await this.repository.getById(id);
  }

  async getByNombre(nombre: string): Promise<ICrono> {
    return await this.repository.getByNombre(nombre);
  }

  async get(filtro: IQueryParam): Promise<IListado<ICrono>> {
    return await this.repository.get(filtro);
  }

  async create(data: ICreateCrono): Promise<ICrono> {
    return await this.repository.create(data);
  }

  async bulk(data: ICreateCrono[]): Promise<void> {
    return await this.repository.bulk(data);
  }

  async update(id: string, data: IUpdateCrono): Promise<ICrono> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<ICrono> {
    return await this.repository.delete(id);
  }
}
