import { Injectable } from '@nestjs/common';
import {
  IDistribuidor,
  ICreateDistribuidor,
  IUpdateDistribuidor,
} from 'modelos/src';
import { DistribuidorsRepository } from './repository';

@Injectable()
export class DistribuidorsService {
  constructor(private repository: DistribuidorsRepository) {}

  async getById(id: string): Promise<IDistribuidor> {
    return await this.repository.getById(id);
  }

  async create(data: ICreateDistribuidor): Promise<IDistribuidor> {
    return await this.repository.create(data);
  }

  async update(id: string, data: IUpdateDistribuidor): Promise<IDistribuidor> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IDistribuidor> {
    return await this.repository.delete(id);
  }
}
