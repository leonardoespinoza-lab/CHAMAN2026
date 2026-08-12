import { Injectable, NotFoundException } from '@nestjs/common';
import { ICreateReporte, IQueryParam, IUpdateReporte } from 'modelos/src';
import { ReportesRepository } from './repository';

@Injectable()
export class ReportesService {
  constructor(private repository: ReportesRepository) {}

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

  async historico(
    dispositivo: string,
    options?: { dias?: number; limit?: number },
  ) {
    return await this.repository.historico(dispositivo, {
      dias: Math.max(1, Math.min(Number(options?.dias) || 7, 365)),
      limit: Math.max(1, Math.min(Number(options?.limit) || 2000, 5000)),
    });
  }

  async create(dato: ICreateReporte) {
    return await this.repository.create(dato);
  }

  async deleteByDeveui(deveui: string) {
    return await this.repository.deleteByDeveui(deveui);
  }

  async getRecentPartialByDeveui(
    deveui: string,
    referenceDate: Date,
    windowMinutes = 20,
  ) {
    return await this.repository.getRecentPartialByDeveui(
      deveui,
      referenceDate,
      windowMinutes,
    );
  }

  async getRecentByDeveui(
    deveui: string,
    referenceDate: Date,
    windowMinutes = 20,
  ) {
    return await this.repository.getRecentByDeveui(
      deveui,
      referenceDate,
      windowMinutes,
    );
  }

  async getByDeveuiAndFecha(
    deveui: string,
    referenceDate: Date,
    windowSeconds = 1,
  ) {
    return await this.repository.getByDeveuiAndFecha(
      deveui,
      referenceDate,
      windowSeconds,
    );
  }

  async update(id: string, dato: IUpdateReporte) {
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
