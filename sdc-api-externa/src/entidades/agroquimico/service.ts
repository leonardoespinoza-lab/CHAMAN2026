import { Injectable } from '@nestjs/common';
import {
  IAgroquimico,
  ICreateAgroquimico,
  IListado,
  IQueryParam,
  IUpdateAgroquimico,
} from 'modelos/src';
import { AgroquimicosRepository } from './repository';

@Injectable()
export class AgroquimicosService {
  constructor(private repository: AgroquimicosRepository) {}

  async getById(id: string): Promise<IAgroquimico> {
    return await this.repository.getById(id);
  }

  async getByNombre(nombre: string): Promise<IAgroquimico> {
    return await this.repository.getByNombre(nombre);
  }

  async get(filtro: IQueryParam): Promise<IListado<IAgroquimico>> {
    return await this.repository.get(filtro);
  }

  async create(data: ICreateAgroquimico): Promise<IAgroquimico> {
    return await this.repository.create(data);
  }

  async bulk(data: ICreateAgroquimico[]): Promise<void> {
    return await this.repository.bulk(data);
  }

  async update(id: string, data: IUpdateAgroquimico): Promise<IAgroquimico> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IAgroquimico> {
    return await this.repository.delete(id);
  }
}
