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
    dato = this.withManualSoilProvenance(
      this.withoutAutomaticDepartment(dato),
      this.hasPhysicalSoilChange(undefined, dato),
    );
    const created = await this.repository.create(dato);
    this.requestSpatialResolution(`${created._id}`, 'lot_created');
    return created;
  }

  async update(id: string, dato: IUpdateLote) {
    dato = this.withoutAutomaticDepartment(dato);
    const geometryChanged = Object.prototype.hasOwnProperty.call(
      dato,
      'ubicacion',
    );
    const hasSoilPayload = this.hasSoilPayload(dato);
    const current =
      geometryChanged || hasSoilPayload
        ? await this.repository.getById(id)
        : undefined;
    const manualSoilChanged = hasSoilPayload
      ? this.hasPhysicalSoilChange(current, dato)
      : false;
    dato = this.withManualSoilProvenance(dato, manualSoilChanged);
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
      } else if (manualSoilChanged) {
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

  private hasSoilPayload(data: IUpdateLote | ICreateLote): boolean {
    return [
      'suelos',
      'capacidadDeCampo',
      'puntoMarchitez',
      'sueloReferencia',
      'texturaLixiviacion',
      'texturaEscorrentia',
    ].some((key) => Object.prototype.hasOwnProperty.call(data, key));
  }

  /**
   * Separa una modificacion fisica del suelo de cambios dinamicos del cultivo
   * (por ejemplo `hayRaices`) o del mapeo de sensores. Antes cualquier PUT que
   * incluyera `suelos` convertia todo el lote en una observacion manual, aun
   * cuando riego solo actualizaba raices o el formulario reenviaba los mismos
   * valores.
   */
  private hasPhysicalSoilChange(current: any, data: IUpdateLote): boolean {
    const scalarFields = [
      'capacidadDeCampo',
      'puntoMarchitez',
      'sueloReferencia',
      'texturaLixiviacion',
      'texturaEscorrentia',
    ];
    for (const key of scalarFields) {
      if (
        Object.prototype.hasOwnProperty.call(data, key) &&
        !this.sameValue((current as any)?.[key], (data as any)[key])
      ) {
        return true;
      }
    }

    if (!Object.prototype.hasOwnProperty.call(data, 'suelos')) return false;
    return !this.sameValue(
      this.physicalLayers(current?.suelos),
      this.physicalLayers(data.suelos),
    );
  }

  private physicalLayers(layers: any[] | undefined): unknown[] {
    return (layers || [])
      .map((layer, index) => ({
        index,
        textura: layer?.textura,
        capacidadDeCampo: layer?.capacidadDeCampo,
        puntoMarchitez: layer?.puntoMarchitez,
        hasTexture: Object.prototype.hasOwnProperty.call(
          layer || {},
          'textura',
        ),
        hasFieldCapacity: Object.prototype.hasOwnProperty.call(
          layer || {},
          'capacidadDeCampo',
        ),
        hasWiltingPoint: Object.prototype.hasOwnProperty.call(
          layer || {},
          'puntoMarchitez',
        ),
      }))
      .filter(
        (layer) =>
          layer.hasTexture || layer.hasFieldCapacity || layer.hasWiltingPoint,
      );
  }

  private sameValue(left: unknown, right: unknown): boolean {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }

  private withManualSoilProvenance<T extends ICreateLote | IUpdateLote>(
    data: T,
    physicalSoilChanged: boolean,
  ): T {
    if (!physicalSoilChanged) return data;
    // Una calibracion generada por la sonda conserva su procedencia. Los
    // valores cartograficos automaticos no pasan por este servicio: los
    // persiste exclusivamente el motor de inteligencia de suelo.
    if (
      data.sueloProcedencia === 'sensor' &&
      data.sueloConfirmadoPorUsuario !== true
    ) {
      return data;
    }
    return {
      ...data,
      sueloProcedencia: 'manual',
      sueloConfirmadoPorUsuario: true,
      sueloFechaConfirmacion: new Date().toISOString(),
    } as T;
  }
}
