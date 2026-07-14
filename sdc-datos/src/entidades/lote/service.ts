import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ICreateLote, IQueryParam, IUpdateLote } from 'modelos/src';
import { LotesRepository } from './repository';
import { LotLocationService } from '../ubicacion-lote/service';

@Injectable()
export class LotesService {
  private readonly logger = new Logger(LotesService.name);

  constructor(
    private repository: LotesRepository,
    private lotLocationService: LotLocationService,
  ) {}

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

  async create(dato: ICreateLote) {
    const created = await this.repository.create(dato);
    this.requestLocationResolution(`${created._id}`, 'lot_created');
    return created;
  }

  async update(id: string, dato: IUpdateLote) {
    const geometryChanged = Object.prototype.hasOwnProperty.call(
      dato,
      'ubicacion',
    );
    const current = geometryChanged
      ? await this.repository.getById(id)
      : undefined;
    const updated = await this.repository.update(id, dato);
    if (updated) {
      if (geometryChanged) {
        const hadGeometry = !!(
          current?.ubicacion?.geojson?.coordinates?.length ||
          current?.ubicacion?.poligono?.length
        );
        this.requestLocationResolution(
          id,
          hadGeometry ? 'geometry_changed' : 'geometry_added',
        );
      }
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

  async deleteMany(query: IQueryParam) {
    return await this.repository.deleteMany(query);
  }

  private requestLocationResolution(
    loteId: string,
    motivo: 'lot_created' | 'geometry_added' | 'geometry_changed',
  ): void {
    this.lotLocationService
      .requestResolution(loteId, motivo)
      .catch((error) =>
        this.logger.error(
          `No se pudo encolar la ubicacion administrativa del lote ${loteId}: ${error?.message || error}`,
        ),
      );
  }
}
