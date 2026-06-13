import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ICreateDispositivo,
  ILorawanUplink,
  IQueryParam,
  IUpdateDispositivo,
} from 'modelos/src';
import { DispositivosRepository } from './repository';

@Injectable()
export class DispositivosService {
  constructor(private repository: DispositivosRepository) {}

  async getFilter(query: IQueryParam) {
    return await this.repository.getFilter(query);
  }

  async getById(id: string) {
    const data = await this.repository.getById(id);
    if (data) {
      return data;
    }
    throw new NotFoundException('No encontrado');
  }

  async create(dato: ICreateDispositivo) {
    return await this.repository.create(dato);
  }

  async upsertFromLorawanUplink(uplink: ILorawanUplink) {
    return await this.repository.upsertFromLorawanUplink(uplink);
  }

  async update(id: string, dato: IUpdateDispositivo) {
    const updated = await this.repository.update(id, dato);
    if (updated) {
      return updated;
    }
    throw new NotFoundException('No encontrado');
  }

  async delete(id: string) {
    const deleted = await this.repository.delete(id);
    if (deleted) {
      return deleted;
    }
    throw new NotFoundException('No encontrado');
  }
}
