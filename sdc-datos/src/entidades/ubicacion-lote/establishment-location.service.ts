import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import {
  IUbicacion,
  IUbicacionAdministrativaEstablecimiento,
  TMotivoResolucionUbicacionEstablecimiento,
} from 'modelos/src';
import { Model } from 'mongoose';
import { LOT_LOCATION_RESOLVER_VERSION } from '../../env';
import {
  Establecimiento,
  EstablecimientoDocument,
} from '../establecimiento/modelos/schema';
import { LotGeometryNormalizer } from './geometry-normalizer.service';
import {
  EstablishmentAdministrativeLocation,
  EstablishmentAdministrativeLocationDocument,
} from './modelos/establishment-location.schema';
import { LotAdministrativeResolver } from './resolver.service';
import { LotLocationRepository } from './repository';

@Injectable()
export class EstablishmentLocationService {
  private readonly logger = new Logger(EstablishmentLocationService.name);
  private readonly inFlight = new Map<
    string,
    Promise<IUbicacionAdministrativaEstablecimiento>
  >();

  constructor(
    @InjectModel(Establecimiento.name)
    private readonly establishments: Model<EstablecimientoDocument>,
    @InjectModel(EstablishmentAdministrativeLocation.name)
    private readonly history: Model<EstablishmentAdministrativeLocationDocument>,
    private readonly repository: LotLocationRepository,
    private readonly normalizer: LotGeometryNormalizer,
    private readonly resolver: LotAdministrativeResolver,
  ) {}

  async getCurrent(
    establecimientoId: string,
  ): Promise<IUbicacionAdministrativaEstablecimiento | null> {
    const establishment = await this.establishments
      .findById(establecimientoId)
      .select('ubicacionOficial')
      .lean();
    if (!establishment)
      throw new NotFoundException('Establecimiento no encontrado');
    return establishment.ubicacionOficial || null;
  }

  async requestResolution(
    establecimientoId: string,
    motivo: TMotivoResolucionUbicacionEstablecimiento,
    options: { force?: boolean } = {},
  ): Promise<IUbicacionAdministrativaEstablecimiento> {
    const establishment = await this.establishments
      .findById(establecimientoId)
      .lean();
    if (!establishment)
      throw new NotFoundException('Establecimiento no encontrado');

    const snapshot = await this.repository.getActiveSnapshot();
    const combinedLocation = this.combineLocations(establishment.ubicacion);
    let normalized;
    try {
      normalized = this.normalizer.normalize(combinedLocation);
    } catch (error) {
      return this.saveEmbedded(establishment, {
        establecimientoId,
        estado: combinedLocation ? 'invalid_geometry' : 'missing_geometry',
        confianza: 'sin_calcular',
        advertencias: [error?.message || `${error}`],
        motivo,
        geometryHash: this.rawHash(establishment.ubicacion),
        sourceVersion: snapshot?.sourceVersion || 'catalog-unavailable',
        snapshotId: snapshot?.snapshotId || 'catalog-unavailable',
        resolverVersion: LOT_LOCATION_RESOLVER_VERSION,
        fechaSolicitud: new Date().toISOString(),
      });
    }

    const resolutionKey = this.key(
      establecimientoId,
      normalized.geometryHash,
      snapshot?.sourceVersion || 'catalog-unavailable',
    );
    const existing = establishment.ubicacionOficial;
    if (
      existing &&
      !options.force &&
      existing.resolutionKey === resolutionKey &&
      ['ready', 'partial', 'outside_supported_area'].includes(existing.estado)
    ) {
      return existing;
    }

    const running = this.inFlight.get(resolutionKey);
    if (running) return running;

    if (!snapshot) {
      return this.saveEmbedded(establishment, {
        establecimientoId,
        estado: 'source_unavailable',
        confianza: 'sin_calcular',
        advertencias: [
          'El catalogo local de GeoRef aun no tiene un snapshot activo.',
        ],
        motivo,
        geometryHash: normalized.geometryHash,
        resolutionKey,
        sourceVersion: 'catalog-unavailable',
        snapshotId: 'catalog-unavailable',
        resolverVersion: LOT_LOCATION_RESOLVER_VERSION,
        fechaSolicitud: new Date().toISOString(),
      });
    }

    await this.saveEmbedded(establishment, {
      establecimientoId,
      estado: 'processing',
      confianza: 'sin_calcular',
      motivo,
      geometryHash: normalized.geometryHash,
      resolutionKey,
      sourceVersion: snapshot.sourceVersion,
      snapshotId: snapshot.snapshotId,
      resolverVersion: LOT_LOCATION_RESOLVER_VERSION,
      fechaSolicitud: new Date().toISOString(),
      fechaInicio: new Date().toISOString(),
      advertencias: normalized.warnings,
    });

    const task = this.process({
      establishment,
      normalized,
      resolutionKey,
      snapshotId: snapshot.snapshotId,
      sourceVersion: snapshot.sourceVersion,
      motivo,
    }).finally(() => this.inFlight.delete(resolutionKey));
    this.inFlight.set(resolutionKey, task);
    return task;
  }

  async backfill(
    motivo: TMotivoResolucionUbicacionEstablecimiento = 'backfill',
    limit = 0,
  ): Promise<{
    total: number;
    resolved: number;
    skipped: number;
    failed: number;
  }> {
    const query = this.establishments
      .find({
        $or: [
          { 'ubicacion.geojson.coordinates.0': { $exists: true } },
          { 'ubicacion.poligono.2': { $exists: true } },
        ],
      })
      .select('_id')
      .sort({ _id: 1 });
    if (limit > 0) query.limit(limit);
    const establishments = await query.lean();
    let resolved = 0;
    let skipped = 0;
    let failed = 0;
    for (const establishment of establishments) {
      try {
        const result = await this.requestResolution(
          `${establishment._id}`,
          motivo,
        );
        if (
          ['ready', 'partial', 'outside_supported_area'].includes(result.estado)
        )
          resolved++;
        else skipped++;
      } catch (error) {
        failed++;
        this.logger.error(
          `Backfill de ubicacion fallo para establecimiento ${establishment._id}: ${error?.message || error}`,
        );
      }
    }
    return { total: establishments.length, resolved, skipped, failed };
  }

  private async process(input: {
    establishment: any;
    normalized: ReturnType<LotGeometryNormalizer['normalize']>;
    resolutionKey: string;
    snapshotId: string;
    sourceVersion: string;
    motivo: TMotivoResolucionUbicacionEstablecimiento;
  }): Promise<IUbicacionAdministrativaEstablecimiento> {
    try {
      const resolved = await this.resolver.resolve({
        loteId: `${input.establishment._id}`,
        snapshotId: input.snapshotId,
        sourceVersion: input.sourceVersion,
        resolverVersion: LOT_LOCATION_RESOLVER_VERSION,
        resolutionKey: input.resolutionKey,
        geometry: input.normalized,
      });
      const now = new Date().toISOString();
      const location: IUbicacionAdministrativaEstablecimiento = {
        ...(resolved.location as any),
        establecimientoId: `${input.establishment._id}`,
        intersecciones: resolved.intersections,
        geometryHash: input.normalized.geometryHash,
        resolutionKey: input.resolutionKey,
        snapshotId: input.snapshotId,
        sourceVersion: input.sourceVersion,
        resolverVersion: LOT_LOCATION_RESOLVER_VERSION,
        motivo: input.motivo,
        fechaSolicitud:
          input.establishment.ubicacionOficial?.fechaSolicitud || now,
        fechaResolucion: now,
        fechaActualizacion: now,
      };
      await this.persistResult(input.establishment, location);
      return location;
    } catch (error) {
      const failed: IUbicacionAdministrativaEstablecimiento = {
        establecimientoId: `${input.establishment._id}`,
        estado: 'failed',
        confianza: 'baja',
        motivo: input.motivo,
        geometryHash: input.normalized.geometryHash,
        resolutionKey: input.resolutionKey,
        snapshotId: input.snapshotId,
        sourceVersion: input.sourceVersion,
        resolverVersion: LOT_LOCATION_RESOLVER_VERSION,
        advertencias: [error?.message || `${error}`],
        fechaResolucion: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString(),
      };
      await this.persistResult(input.establishment, failed);
      throw error;
    }
  }

  private async persistResult(
    establishment: any,
    location: IUbicacionAdministrativaEstablecimiento,
  ): Promise<void> {
    const update: Record<string, unknown> = { ubicacionOficial: location };
    if (
      establishment.ubicacionAdministrativa &&
      !establishment.ubicacionAdministrativaLegada
    ) {
      update.ubicacionAdministrativaLegada = {
        valor: establishment.ubicacionAdministrativa,
        origen: 'desconocido',
        fechaPreservacion: new Date().toISOString(),
        soloLectura: true,
      };
    }
    await this.establishments.updateOne(
      { _id: establishment._id },
      { $set: update },
    );
    await this.history.findOneAndUpdate(
      { resolutionKey: location.resolutionKey },
      {
        $set: {
          establecimientoId: location.establecimientoId,
          resolutionKey: location.resolutionKey,
          geometryHash: location.geometryHash,
          snapshotId: location.snapshotId,
          sourceVersion: location.sourceVersion,
          resolverVersion: location.resolverVersion,
          estado: location.estado,
          resultado: location,
          motivo: location.motivo,
          fechaResolucion: location.fechaResolucion,
        },
      },
      { upsert: true, new: true },
    );
  }

  private async saveEmbedded(
    establishment: any,
    location: IUbicacionAdministrativaEstablecimiento,
  ): Promise<IUbicacionAdministrativaEstablecimiento> {
    const result = {
      ...location,
      fechaActualizacion: new Date().toISOString(),
    };
    await this.establishments.updateOne(
      { _id: establishment._id },
      { $set: { ubicacionOficial: result } },
    );
    return result;
  }

  private combineLocations(locations?: IUbicacion[]): IUbicacion | undefined {
    const polygons: any[] = [];
    for (const location of locations || []) {
      const geojson = location.geojson as any;
      if (geojson?.type === 'Polygon' && geojson.coordinates?.length) {
        polygons.push(geojson.coordinates);
      } else if (
        geojson?.type === 'MultiPolygon' &&
        geojson.coordinates?.length
      ) {
        polygons.push(...geojson.coordinates);
      } else if (location.poligono?.length) {
        polygons.push([
          location.poligono.map((coordinate) => [
            coordinate.lng,
            coordinate.lat,
          ]),
        ]);
      }
    }
    if (!polygons.length) return undefined;
    return {
      geojson: {
        type: 'MultiPolygon',
        coordinates: polygons,
      } as any,
    };
  }

  private rawHash(value: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(value || {}))
      .digest('hex');
  }

  private key(
    establecimientoId: string,
    geometryHash: string,
    sourceVersion: string,
  ): string {
    return createHash('sha256')
      .update(
        `establecimiento:${establecimientoId}:${geometryHash}:${sourceVersion}:${LOT_LOCATION_RESOLVER_VERSION}`,
      )
      .digest('hex');
  }
}
