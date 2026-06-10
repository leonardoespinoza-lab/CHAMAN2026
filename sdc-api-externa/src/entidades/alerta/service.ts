import { Injectable } from '@nestjs/common';
import {
  IAlerta,
  ICreateAlerta,
  IListado,
  IQueryParam,
  IUpdateAlerta,
  IFilter,
} from 'modelos/src';
import { AlertasRepository } from './repository';

@Injectable()
export class AlertasService {
  constructor(private repository: AlertasRepository) {}

  async getById(id: string): Promise<IAlerta> {
    return await this.repository.getById(id);
  }

  async getByIdSiembra(idSiembra: string): Promise<IListado<IAlerta>> {
    const filter: IFilter<IAlerta> = { idSiembra };
    const params: IQueryParam = {
      filter: JSON.stringify(filter),
    };
    return await this.repository.get(params);
  }

  async getUltimaActivaByIdSiembra(idSiembra: string): Promise<IAlerta> {
    const filter: IFilter<IAlerta> = { idSiembra, activa: true };
    const params: IQueryParam = {
      filter: JSON.stringify(filter),
      limit: 1,
    };
    const a = await this.repository.get(params);
    return a.datos[0];
  }

  async create(data: ICreateAlerta): Promise<IAlerta> {
    return await this.repository.create(data);
  }

  async bulk(data: ICreateAlerta[]): Promise<void> {
    return await this.repository.bulk(data);
  }

  async update(id: string, data: IUpdateAlerta): Promise<IAlerta> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IAlerta> {
    return await this.repository.delete(id);
  }
}
