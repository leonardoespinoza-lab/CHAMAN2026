import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ICreateLote, IQueryParam, IUpdateLote } from 'modelos/src';
import { LotesRepository } from './repository';
import { LotLocationService } from '../ubicacion-lote/service';
import { LotSoilIntelligenceEngine } from '../suelo-inteligencia/engine.service';

@Injectable()
export class LotesService {
  private readonly logger = new Logger(LotesService.name);

  constructor(
    private repository: LotesRepository,
    private lotLocationService: LotLocationService,
    private soilIntelligence: LotSoilIntelligenceEngine,
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
    dato = this.withManualSoilProvenance(this.withoutAutomaticDepartment(dato));
    const created = await this.repository.create(dato);
    this.requestSpatialResolution(`${created._id}`, 'lot_created');
    return created;
  }

  async update(id: string, dato: IUpdateLote) {
    dato = this.withoutAutomaticDepartment(dato);
    dato = this.withManualSoilProvenance(dato);
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
        this.requestSpatialResolution(
          id,
          hadGeometry ? 'geometry_changed' : 'geometry_added',
        );
      } else if (this.hasManualSoilChange(dato)) {
        this.requestSoilResolution(id, 'manual_value_changed');
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

  private requestSpatialResolution(
    loteId: string,
    motivo: 'lot_created' | 'geometry_added' | 'geometry_changed',
  ): void {
    void (async () => {
      try {
        await this.lotLocationService.requestResolution(loteId, motivo, {
          immediate: true,
        });
      } catch (error) {
        this.logger.error(
          `No se pudo encolar la ubicacion administrativa del lote ${loteId}: ${error?.message || error}`,
        );
      }

      // El suelo depende de la provincia resuelta para priorizar las capas
      // INTA. Aun si la ubicacion falla, SoilGrids debe poder completar la
      // evaluacion, por eso este segundo intento nunca se omite.
      this.requestSoilResolution(loteId, motivo);
    })();
  }

  private withoutAutomaticDepartment<T>(input: T): T {
    const data = { ...input } as T & Record<string, unknown>;
    delete data.idDepartamento;
    delete data.ubicacionDepartamentoLegado;
    return data;
  }

  private requestSoilResolution(
    loteId: string,
    reason:
      | 'lot_created'
      | 'geometry_added'
      | 'geometry_changed'
      | 'manual_value_changed',
  ): void {
    this.soilIntelligence
      .request(loteId, reason)
      .catch((error) =>
        this.logger.error(
          `No se pudo encolar la inteligencia de suelo del lote ${loteId}: ${error?.message || error}`,
        ),
      );
  }

  private hasManualSoilChange(data: IUpdateLote): boolean {
    return [
      'suelos',
      'capacidadDeCampo',
      'puntoMarchitez',
      'sueloReferencia',
      'texturaLixiviacion',
      'texturaEscorrentia',
    ].some((key) => Object.prototype.hasOwnProperty.call(data, key));
  }

  private withManualSoilProvenance<T extends ICreateLote | IUpdateLote>(
    data: T,
  ): T {
    if (!this.hasManualSoilChange(data as IUpdateLote)) return data;
    return {
      ...data,
      sueloProcedencia: 'manual',
      sueloConfirmadoPorUsuario: true,
      sueloFechaConfirmacion: new Date().toISOString(),
    } as T;
  }
}
