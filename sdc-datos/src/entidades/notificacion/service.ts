import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ICreateNotificacion,
  IQueryParam,
  IUpdateNotificacion,
} from 'modelos/src';
import { NotificacionsRepository } from './repository';

@Injectable()
export class NotificacionsService {
  constructor(private repository: NotificacionsRepository) {}

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

  async create(dato: ICreateNotificacion) {
    return await this.repository.create(dato);
  }

  async bulk(data: ICreateNotificacion[]) {
    return await this.repository.bulk(data);
  }

  async update(id: string, dato: IUpdateNotificacion) {
    const updated = await this.repository.update(id, dato);
    if (updated) {
      return updated;
    }
    throw new NotFoundException('No encontrado');
  }

  async updateMany(query: IQueryParam, data: IUpdateNotificacion) {
    return await this.repository.updateMany(query, data);
  }

  async delete(id: string) {
    const deleted = await this.repository.delete(id);
    if (deleted) {
      return deleted;
    }
    throw new NotFoundException('No encontrado');
  }
}
