import { Injectable } from '@nestjs/common';
import {
  IEmpresa,
  ICreateEmpresa,
  IListado,
  IQueryParam,
  IUpdateEmpresa,
} from 'modelos/src';
import { EmpresasRepository } from './repository';

@Injectable()
export class EmpresasService {
  constructor(private repository: EmpresasRepository) {}

  async getById(id: string): Promise<IEmpresa> {
    return await this.repository.getById(id);
  }

  async getByNombre(nombre: string): Promise<IEmpresa> {
    return await this.repository.getByNombre(nombre);
  }

  async get(filtro: IQueryParam): Promise<IListado<IEmpresa>> {
    return await this.repository.get(filtro);
  }

  async create(data: ICreateEmpresa): Promise<IEmpresa> {
    return await this.repository.create(data);
  }

  async bulk(data: ICreateEmpresa[]): Promise<void> {
    return await this.repository.bulk(data);
  }

  async update(id: string, data: IUpdateEmpresa): Promise<IEmpresa> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IEmpresa> {
    return await this.repository.delete(id);
  }
}
