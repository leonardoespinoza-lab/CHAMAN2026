import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import {
  IUbicacionAdministrativaLote,
  TMotivoResolucionUbicacionLote,
} from 'modelos/src';
import { Model } from 'mongoose';
import { LOT_LOCATION_RESOLVER_VERSION } from '../../env';
import { Lote, LoteDocument } from '../lote/modelos/schema';
import {
  Departamento,
  DepartamentoDocument,
} from '../departamento/modelos/schema';
import { LotGeometryNormalizer } from './geometry-normalizer.service';
import { LotAdministrativeResolver } from './resolver.service';
import { LotLocationRepository } from './repository';

@Injectable()
export class LotLocationService {
  private readonly logger = new Logger(LotLocationService.name);
  private readonly inFlight = new Map<
    string,
    Promise<IUbicacionAdministrativaLote>
  >();

  constructor(
    @InjectModel(Lote.name) private readonly lotes: Model<LoteDocument>,
    private readonly repository: LotLocationRepository,
    private readonly normalizer: LotGeometryNormalizer,
    private readonly resolver: LotAdministrativeResolver,
    @Optional()
    @InjectModel(Departamento.name)
    private readonly departamentos?: Model<DepartamentoDocument>,
  ) {}

  async getCurrent(
    loteId: string,
  ): Promise<IUbicacionAdministrativaLote | null> {
    const location = await this.repository.getCurrentLocation(loteId);
    if (!location) return null;
    const intersections = await this.repository.getIntersections(
      location.resolutionKey,
    );
    return {
      ...(location as any),
      intersecciones: intersections,
    } as IUbicacionAdministrativaLote;
  }

  async requestResolution(
    loteId: string,
    motivo: TMotivoResolucionUbicacionLote,
    options: { immediate?: boolean; force?: boolean } = {},
  ): Promise<IUbicacionAdministrativaLote> {
    const lot = await this.lotes
      .findById(loteId)
      .populate({ path: 'departamento', populate: { path: 'provincia' } })
      .lean();
    if (!lot) throw new NotFoundException('Lote no encontrado');

    const snapshot = await this.repository.getActiveSnapshot();
    let normalized;
    try {
      normalized = this.normalizer.normalize(lot.ubicacion);
    } catch (error) {
      const rawHash = createHash('sha256')
        .update(JSON.stringify(lot.ubicacion || {}))
        .digest('hex');
      const noGeometry =
        !lot.ubicacion?.geojson?.coordinates?.length &&
        !lot.ubicacion?.poligono?.length;
      return (await this.repository.prepareLocation({
        loteId,
        resolutionKey: this.key(
          loteId,
          rawHash,
          snapshot?.sourceVersion || 'catalog-unavailable',
        ),
        geometryHash: rawHash,
        snapshotId: snapshot?.snapshotId || 'catalog-unavailable',
        sourceVersion: snapshot?.sourceVersion || 'catalog-unavailable',
        resolverVersion: LOT_LOCATION_RESOLVER_VERSION,
        estado: noGeometry ? 'missing_geometry' : 'invalid_geometry',
        confianza: 'sin_calcular',
        advertencias: [error?.message || `${error}`],
        motivo,
        isCurrent: true,
        fechaSolicitud: new Date().toISOString(),
      })) as any;
    }

    if (!snapshot) {
      return (await this.repository.prepareLocation({
        loteId,
        resolutionKey: this.key(
          loteId,
          normalized.geometryHash,
          'catalog-unavailable',
        ),
        geometryHash: normalized.geometryHash,
        snapshotId: 'catalog-unavailable',
        sourceVersion: 'catalog-unavailable',
        resolverVersion: LOT_LOCATION_RESOLVER_VERSION,
        estado: 'source_unavailable',
        confianza: 'sin_calcular',
        advertencias: [
          'El catalogo local de GeoRef aun no tiene un snapshot activo.',
        ],
        motivo,
        isCurrent: true,
        fechaSolicitud: new Date().toISOString(),
      })) as any;
    }

    const resolutionKey = this.key(
      loteId,
      normalized.geometryHash,
      snapshot.sourceVersion,
    );
    const existing = await this.repository.getByResolutionKey(resolutionKey);
    const running = this.inFlight.get(resolutionKey);
    if (running) {
      if (options.immediate) return running;
      return existing as IUbicacionAdministrativaLote;
    }
    if (
      existing &&
      !options.force &&
      ['ready', 'outside_supported_area'].includes(existing.estado)
    ) {
      await this.repository.makeCurrent(loteId, resolutionKey);
      return (await this.getCurrent(loteId)) as IUbicacionAdministrativaLote;
    }

    const pending = await this.repository.prepareLocation({
      loteId,
      resolutionKey,
      geometryHash: normalized.geometryHash,
      snapshotId: snapshot.snapshotId,
      sourceVersion: snapshot.sourceVersion,
      resolverVersion: LOT_LOCATION_RESOLVER_VERSION,
      estado: options.immediate ? 'processing' : 'pending',
      confianza: 'sin_calcular',
      motivo,
      isCurrent: true,
      fechaSolicitud: new Date().toISOString(),
      advertencias: normalized.warnings,
    });

    const task = this.process({
      lot,
      normalized,
      resolutionKey,
      snapshotId: snapshot.snapshotId,
      sourceVersion: snapshot.sourceVersion,
      motivo,
    });
    this.inFlight.set(resolutionKey, task);
    void task.then(
      () => this.inFlight.delete(resolutionKey),
      (error) => {
        this.inFlight.delete(resolutionKey);
        if (!options.immediate) {
          this.logger.error(
            `Resolucion de ubicacion fallo para lote ${loteId}: ${error?.message || error}`,
          );
        }
      },
    );
    if (options.immediate) return task;
    return pending as any;
  }

  async backfill(
    motivo: TMotivoResolucionUbicacionLote = 'backfill',
    limit = 0,
  ): Promise<{
    total: number;
    resolved: number;
    skipped: number;
    failed: number;
  }> {
    const query = this.lotes
      .find({
        $or: [
          { 'ubicacion.geojson.coordinates.0': { $exists: true } },
          { 'ubicacion.poligono.2': { $exists: true } },
        ],
      })
      .select('_id')
      .sort({ _id: 1 });
    if (limit > 0) query.limit(limit);
    const lots = await query.lean();
    let resolved = 0;
    let skipped = 0;
    let failed = 0;
    for (const lot of lots) {
      try {
        const result = await this.requestResolution(`${lot._id}`, motivo, {
          immediate: true,
        });
        if (
          ['ready', 'partial', 'outside_supported_area'].includes(result.estado)
        )
          resolved++;
        else skipped++;
      } catch (error) {
        failed++;
        this.logger.error(
          `Backfill de ubicacion fallo para lote ${lot._id}: ${error?.message || error}`,
        );
      }
    }
    return { total: lots.length, resolved, skipped, failed };
  }

  private async process(input: {
    lot: any;
    normalized: ReturnType<LotGeometryNormalizer['normalize']>;
    resolutionKey: string;
    snapshotId: string;
    sourceVersion: string;
    motivo: TMotivoResolucionUbicacionLote;
  }): Promise<IUbicacionAdministrativaLote> {
    await this.repository.saveLocation(input.resolutionKey, {
      estado: 'processing',
      fechaInicio: new Date().toISOString(),
      error: undefined,
    });
    try {
      const manualDepartment = input.lot.departamento
        ? {
            id: `${input.lot.idDepartamento || ''}`,
            name: input.lot.departamento.nombre,
            province: input.lot.departamento.provincia?.nombre,
          }
        : input.lot.idDepartamento
          ? { id: `${input.lot.idDepartamento}` }
          : undefined;
      const resolved = await this.resolver.resolve({
        loteId: `${input.lot._id}`,
        snapshotId: input.snapshotId,
        sourceVersion: input.sourceVersion,
        resolverVersion: LOT_LOCATION_RESOLVER_VERSION,
        resolutionKey: input.resolutionKey,
        geometry: input.normalized,
        manualDepartment,
      });
      await this.synchronizeAlgorithmDepartment(input.lot, resolved.location);
      await this.repository.replaceIntersections(
        input.resolutionKey,
        `${input.lot._id}`,
        resolved.intersections.map((item) => ({
          recurso: item.recurso,
          entityId: item.id,
          nombre: item.nombre,
          categoria: item.categoria,
          fuente: item.fuente,
          superficieInterseccionM2: item.superficieInterseccionM2,
          porcentajeLote: item.porcentajeLote,
          dominante: item.dominante,
        })),
      );
      await this.repository.saveLocation(input.resolutionKey, {
        ...resolved.location,
        fechaResolucion: new Date().toISOString(),
        motivo: input.motivo,
        error: undefined,
      });
    } catch (error) {
      await this.repository.saveLocation(input.resolutionKey, {
        estado: 'failed',
        confianza: 'baja',
        error: error?.message || `${error}`,
        advertencias: [error?.message || `${error}`],
        fechaResolucion: new Date().toISOString(),
      });
      throw error;
    }
    return (await this.getCurrent(
      `${input.lot._id}`,
    )) as IUbicacionAdministrativaLote;
  }

  private key(
    loteId: string,
    geometryHash: string,
    sourceVersion: string,
  ): string {
    return createHash('sha256')
      .update(
        `${loteId}:${geometryHash}:${sourceVersion}:${LOT_LOCATION_RESOLVER_VERSION}`,
      )
      .digest('hex');
  }

  private async synchronizeAlgorithmDepartment(
    lot: any,
    location: Partial<IUbicacionAdministrativaLote>,
  ): Promise<void> {
    const official = location.nivelAdministrativo2?.nombre;
    const province = location.provincia?.nombre;
    const coverage = Number(location.coberturaPorcentaje || 0);
    if (
      location.confianza !== 'alta' ||
      coverage < 99.5 ||
      !official ||
      !province
    ) {
      return;
    }
    if (!this.departamentos) {
      location.advertencias = [
        ...(location.advertencias || []),
        'No se pudo verificar la equivalencia con la base interna de departamentos.',
      ];
      return;
    }

    const departments = await this.departamentos
      .find()
      .populate('provincia')
      .lean();
    const candidates = departments.filter(
      (department) =>
        this.normalize(department.nombre) === this.normalize(official) &&
        this.normalize(department.provincia?.nombre) ===
          this.normalize(province),
    );
    if (candidates.length !== 1) {
      location.advertencias = [
        ...(location.advertencias || []),
        candidates.length
          ? 'La jurisdiccion oficial coincide con mas de un departamento interno; se conserva el valor operativo anterior.'
          : 'La jurisdiccion oficial aun no tiene una equivalencia exacta en la base interna; se conserva el valor operativo anterior.',
      ];
      return;
    }

    const selectedId = `${candidates[0]._id}`;
    if (`${lot.idDepartamento || ''}` === selectedId) return;

    const update: Record<string, unknown> = { idDepartamento: selectedId };
    if (lot.idDepartamento && !lot.ubicacionDepartamentoLegado) {
      update.ubicacionDepartamentoLegado = {
        idDepartamento: `${lot.idDepartamento}`,
        nombre: lot.departamento?.nombre,
        provincia: lot.departamento?.provincia?.nombre,
        origen: 'desconocido',
        fechaPreservacion: new Date().toISOString(),
      };
    }
    await this.lotes.updateOne({ _id: lot._id }, { $set: update });

    location.advertencias = (location.advertencias || []).filter(
      (warning) => !warning.includes('No fue sobrescrita'),
    );
    if (location.conflictoManual?.existe) {
      location.conflictoManual = {
        ...location.conflictoManual,
        existe: false,
        detalle:
          'La referencia anterior fue preservada como legado y el departamento operativo se sincronizo con GeoRef mediante coincidencia exacta y de alta confianza.',
      };
    }
  }

  private normalize(value?: string): string {
    return `${value || ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }
}
