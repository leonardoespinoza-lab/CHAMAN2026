import { Injectable } from '@nestjs/common';
import { IAlerta, IListado, IQueryParam, IUpdateAlerta } from 'modelos/src';
import { AlertasRepository } from './repository';

@Injectable()
export class AlertasService {
  constructor(private repository: AlertasRepository) {}

  async getById(id: string): Promise<IAlerta> {
    return await this.repository.getById(id);
  }

  async getByIdSiembraActiva(id: string): Promise<IAlerta> {
    const query: IQueryParam = {
      filter: JSON.stringify({ idSiembra: id, activa: true }),
    };
    const res = await this.repository.get(query);
    return res.datos[0];
  }

  async get(filtro: IQueryParam): Promise<IListado<IAlerta>> {
    return await this.repository.get(filtro);
  }

  async update(id: string, data: IUpdateAlerta): Promise<IAlerta> {
    return await this.repository.update(id, data);
  }

  async create(data: IAlerta): Promise<IAlerta> {
    return await this.repository.create(data);
  }
}
