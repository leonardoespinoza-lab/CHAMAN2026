import { Injectable, Logger } from '@nestjs/common';
import {
  ISemilla,
  IListado,
  IQueryParam,
  ICreateSemilla,
  IUpdateSemilla,
} from 'modelos/src';
import { SemillasRepository } from './repository';

@Injectable()
export class SemillasService {
  private readonly logger = new Logger(SemillasService.name);
  constructor(private repository: SemillasRepository) {}

  async getById(id: string): Promise<ISemilla> {
    return await this.repository.getById(id);
  }

  async get(filtro: IQueryParam): Promise<IListado<ISemilla>> {
    return await this.repository.get(filtro);
  }

  async create(data: ICreateSemilla): Promise<ISemilla> {
    return await this.repository.create(data);
  }

  async bulk(data: ICreateSemilla[]): Promise<void> {
    return await this.repository.bulk(data);
  }

  async update(id: string, data: IUpdateSemilla): Promise<ISemilla> {
    const updated = await this.repository.update(id, data);
    if (
      Object.prototype.hasOwnProperty.call(
        data,
        'parametrosAgrometeorologicos',
      ) ||
      Object.prototype.hasOwnProperty.call(data, 'fenologiaReferencia') ||
      Object.prototype.hasOwnProperty.call(data, 'cultivo')
    ) {
      this.repository
        .reprocesarAgrometeorologia(id)
        .catch((error) =>
          this.logger.error(
            `Error al reprocesar agrometeorologia de la semilla ${id}: ${error}`,
          ),
        );
    }
    return updated;
  }

  async delete(id: string): Promise<ISemilla> {
    return await this.repository.delete(id);
  }
}
