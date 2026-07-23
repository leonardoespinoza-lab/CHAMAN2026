import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ICreateEstablecimiento,
  IQueryParam,
  ISolicitudArchivado,
  IUpdateEstablecimiento,
} from 'modelos/src';
import { EstablecimientosRepository } from './repository';
import { EstablishmentLocationService } from '../ubicacion-lote/establishment-location.service';

@Injectable()
export class EstablecimientosService {
  private readonly logger = new Logger(EstablecimientosService.name);

  constructor(
    private repository: EstablecimientosRepository,
    private establishmentLocationService: EstablishmentLocationService,
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

  async create(dato: ICreateEstablecimiento) {
    const created = await this.repository.create(
      this.withoutAutomaticLocation(dato),
    );
    this.requestLocationResolution(`${created._id}`, 'establishment_created');
    return created;
  }

  async update(id: string, dato: IUpdateEstablecimiento) {
    const geometryChanged = Object.prototype.hasOwnProperty.call(
      dato,
      'ubicacion',
    );
    const current = geometryChanged
      ? await this.repository.getById(id)
      : undefined;
    const updated = await this.repository.update(
      id,
      this.withoutAutomaticLocation(dato),
    );
    if (updated) {
      if (geometryChanged) {
        const hadGeometry = !!current?.ubicacion?.some(
          (item) => item.geojson?.coordinates?.length || item.poligono?.length,
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

  async delete(id: string, audit: ISolicitudArchivado = {}) {
    const deleted = await this.repository.delete(id, audit);
    if (deleted) {
      return deleted;
    }
    throw new NotFoundException('No encontrado');
  }

  private withoutAutomaticLocation<T>(input: T): T {
    const data = { ...input } as T & Record<string, unknown>;
    delete data.ubicacionAdministrativa;
    delete data.ubicacionAdministrativaLegada;
    delete data.ubicacionOficial;
    return data;
  }

  private requestLocationResolution(
    establecimientoId: string,
    motivo: 'establishment_created' | 'geometry_added' | 'geometry_changed',
  ): void {
    this.establishmentLocationService
      .requestResolution(establecimientoId, motivo)
      .catch((error) =>
        this.logger.error(
          `No se pudo resolver la ubicacion oficial del establecimiento ${establecimientoId}: ${error?.message || error}`,
        ),
      );
  }
}
