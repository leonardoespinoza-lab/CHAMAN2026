import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ICreateSueloInta,
  IQueryParam,
  IUpdateSueloInta,
} from 'modelos/src';
import { SuelosIntaRepository } from './repository';

@Injectable()
export class SuelosIntaService {
  constructor(private repository: SuelosIntaRepository) {}

  async getFilter(query: IQueryParam) {
    return await this.repository.getFilter(query);
  }

  async getById(id: string) {
    const data = await this.repository.getById(id);
    if (data) return data;
    throw new NotFoundException('No encontrado');
  }

  async getByPoint(latParam: string | number, lngParam: string | number) {
    const lat = Number(latParam);
    const lng = Number(lngParam);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadRequestException('Latitud y longitud invalidas');
    }
    return await this.repository.getByPoint(lat, lng);
  }

  async create(dato: ICreateSueloInta) {
    return await this.repository.create(dato);
  }

  async update(id: string, dato: IUpdateSueloInta) {
    const updated = await this.repository.update(id, dato);
    if (updated) return updated;
    throw new NotFoundException('No encontrado');
  }

  async delete(id: string) {
    const deleted = await this.repository.delete(id);
    if (deleted) return deleted;
    throw new NotFoundException('No encontrado');
  }
}
