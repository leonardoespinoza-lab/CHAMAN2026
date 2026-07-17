import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  ISemilla,
  IListado,
  IQueryParam,
  ICreateSemilla,
  IUpdateSemilla,
} from 'modelos/src';
import { SemillasRepository } from './repository';
import { DecisionPipelineQueueService } from '../../auxiliares/decision-pipeline';

const SCIENTIFIC_SEED_FIELDS = [
  'cultivo',
  'variedad',
  'ciclo',
  'resistencia',
  'campania',
  'tipoCultivo',
  'portainjerto',
  'requerimientoFrio',
  'fenologiaReferencia',
  'sensibilidadHelada',
  'fichaVarietal',
  'parametrosAgrometeorologicos',
] as const;

@Injectable()
export class SemillasService {
  private readonly logger = new Logger(SemillasService.name);
  constructor(
    private repository: SemillasRepository,
    @Optional()
    private readonly decisionPipelineQueue?: DecisionPipelineQueueService,
  ) {}

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
    const changedFields = SCIENTIFIC_SEED_FIELDS.filter((field) =>
      Object.prototype.hasOwnProperty.call(data, field),
    );
    if (changedFields.length) {
      if (this.decisionPipelineQueue) {
        await this.decisionPipelineQueue.enqueueForSeed(id, {
          trigger: 'semilla.science-updated',
          changedFields: [...changedFields],
          sincronizarClima: false,
        });
      } else {
        // Compatibilidad de pruebas construidas fuera del contenedor Nest.
        await this.repository.reprocesarAgrometeorologia(id);
      }
    }
    return updated;
  }

  async delete(id: string): Promise<ISemilla> {
    return await this.repository.delete(id);
  }
}
