import { Injectable } from '@nestjs/common';
import { IPrincipioActivo, IListado, IQueryParam } from 'modelos/src';
import { PrincipioActivosRepository } from './repository';

@Injectable()
export class PrincipioActivosService {
  constructor(private repository: PrincipioActivosRepository) {}

  async getById(id: string): Promise<IPrincipioActivo> {
    return await this.repository.getById(id);
  }

  async get(filtro: IQueryParam): Promise<IListado<IPrincipioActivo>> {
    return await this.repository.get(filtro);
  }
}
