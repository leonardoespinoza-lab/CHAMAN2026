import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { LotLocationRepository } from './repository';
import { booleanPointInPolygon, feature, point } from '@turf/turf';
import {
  GEOREF_BASE_URL,
  GEOREF_REQUEST_RETRIES,
  GEOREF_REQUEST_TIMEOUT_MS,
  GEOREF_RETRY_BASE_DELAY_MS,
  GEOREF_SYNC_LOCK_TTL_MS,
} from '../../env';

const GEOREF_DOWNLOAD_BASE_URL = GEOREF_BASE_URL.replace(/\/$/, '');

interface GeoJsonFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, any>;
}

interface ResourceDefinition {
  resource: string;
  url: string;
  minimumCount: number;
  geometryTypes: string[];
}

const RESOURCES: ResourceDefinition[] = [
  {
    resource: 'provincias',
    url: `${GEOREF_DOWNLOAD_BASE_URL}/provincias.geojson`,
    minimumCount: 24,
    geometryTypes: ['Polygon', 'MultiPolygon'],
  },
  {
    resource: 'departamentos',
    url: `${GEOREF_DOWNLOAD_BASE_URL}/departamentos.geojson`,
    minimumCount: 500,
    geometryTypes: ['Polygon', 'MultiPolygon'],
  },
  {
    resource: 'gobiernos_locales',
    url: `${GEOREF_DOWNLOAD_BASE_URL}/gobiernos-locales.geojson`,
    minimumCount: 1500,
    geometryTypes: ['Polygon', 'MultiPolygon'],
  },
  {
    resource: 'localidades',
    url: `${GEOREF_DOWNLOAD_BASE_URL}/localidades.geojson`,
    minimumCount: 3500,
    geometryTypes: ['Point', 'MultiPoint'],
  },
  {
    resource: 'localidades_censales',
    url: `${GEOREF_DOWNLOAD_BASE_URL}/localidades-censales.geojson`,
    minimumCount: 3500,
    geometryTypes: ['Polygon', 'MultiPolygon'],
  },
  {
    resource: 'asentamientos',
    url: `${GEOREF_DOWNLOAD_BASE_URL}/asentamientos.geojson`,
    minimumCount: 10000,
    geometryTypes: ['Point', 'MultiPoint'],
  },
];

export interface GeorefSyncResult {
  activated: boolean;
  snapshotId: string;
  sourceVersion: string;
  counts: Record<string, number>;
}

@Injectable()
export class GeorefCatalogSyncService {
  private readonly logger = new Logger(GeorefCatalogSyncService.name);
  private running?: Promise<GeorefSyncResult>;

  constructor(private readonly repository: LotLocationRepository) {}

  sync(force = false): Promise<GeorefSyncResult> {
    if (this.running) return this.running;
    this.running = this.executeWithLock(force).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async executeWithLock(force: boolean): Promise<GeorefSyncResult> {
    const owner = `${process.pid}:${randomUUID()}`;
    const acquired = await this.repository.acquireSyncLock(
      owner,
      GEOREF_SYNC_LOCK_TTL_MS,
    );
    if (!acquired) {
      const active = await this.repository.getActiveSnapshot();
      if (!active) {
        throw new Error(
          'Otra instancia esta sincronizando GeoRef y aun no existe un snapshot activo.',
        );
      }
      this.logger.log(
        `Sincronizacion GeoRef omitida: otra instancia mantiene el lock distribuido.`,
      );
      return {
        activated: false,
        snapshotId: active.snapshotId,
        sourceVersion: active.sourceVersion,
        counts: Object.fromEntries(
          active.resources.map((item) => [item.resource, item.count]),
        ),
      };
    }
    try {
      return await this.execute(force);
    } finally {
      await this.repository.releaseSyncLock(owner);
    }
  }

  private async execute(force: boolean): Promise<GeorefSyncResult> {
    const active = await this.repository.getActiveSnapshot();
    const downloads = [] as Array<{
      definition: ResourceDefinition;
      features: GeoJsonFeature[];
      etag?: string;
      lastModified?: string;
      checksum: string;
    }>;

    for (const definition of RESOURCES) {
      downloads.push(await this.download(definition));
    }

    const sourceVersion = createHash('sha256')
      .update(
        downloads
          .map(
            (item) =>
              `${item.definition.resource}:${item.etag || ''}:${item.lastModified || ''}:${item.checksum}`,
          )
          .join('|'),
      )
      .digest('hex');

    if (!force && active?.sourceVersion === sourceVersion) {
      return {
        activated: false,
        snapshotId: active.snapshotId,
        sourceVersion,
        counts: Object.fromEntries(
          active.resources.map((item) => [item.resource, item.count]),
        ),
      };
    }

    const snapshotId = `${new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .slice(0, 14)}-${sourceVersion.slice(0, 12)}-${randomUUID().slice(0, 8)}`;
    const resources = downloads.map((item) => ({
      resource: item.definition.resource,
      sourceUrl: item.definition.url,
      count: item.features.length,
      etag: item.etag,
      lastModified: item.lastModified,
      checksum: item.checksum,
    }));
    const counts = Object.fromEntries(
      resources.map((item) => [item.resource, item.count]),
    );

    await this.repository.createSnapshot({
      snapshotId,
      sourceVersion,
      status: 'syncing',
      resources,
      checksum: sourceVersion,
      previousSnapshotId: active?.snapshotId,
      downloadedAt: new Date().toISOString(),
    });

    try {
      for (const download of downloads) {
        const entities = download.features.map((feature) =>
          this.mapFeature(
            snapshotId,
            download.definition,
            feature,
            download.lastModified,
          ),
        );
        await this.repository.insertCatalogEntities(entities);
        const stored = await this.repository.countSnapshotResource(
          snapshotId,
          download.definition.resource,
        );
        if (stored !== download.features.length) {
          throw new Error(
            `${download.definition.resource}: se descargaron ${download.features.length} entidades pero se almacenaron ${stored}.`,
          );
        }
      }

      await this.repository.updateSnapshot(snapshotId, { status: 'ready' });
      await this.repository.activateSnapshot(snapshotId);
      this.logger.log(
        `Snapshot GeoRef ${snapshotId} activado con ${Object.values(counts).reduce((a, b) => a + b, 0)} entidades.`,
      );
      return { activated: true, snapshotId, sourceVersion, counts };
    } catch (error) {
      const message = error?.message || `${error}`;
      await this.repository.updateSnapshot(snapshotId, {
        status: 'failed',
        error: message,
      });
      await this.repository.deleteSnapshotEntities(snapshotId);
      this.logger.error(
        `Fallo la sincronizacion GeoRef ${snapshotId}: ${message}`,
      );
      throw error;
    }
  }

  private async download(definition: ResourceDefinition) {
    let lastError: unknown;
    for (let attempt = 0; attempt <= GEOREF_REQUEST_RETRIES; attempt++) {
      try {
        return await this.downloadOnce(definition);
      } catch (error) {
        lastError = error;
        if (attempt >= GEOREF_REQUEST_RETRIES) break;
        const delay = GEOREF_RETRY_BASE_DELAY_MS * 2 ** attempt;
        this.logger.warn(
          `${definition.resource}: intento ${attempt + 1} fallo; reintento en ${delay} ms.`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  private async downloadOnce(definition: ResourceDefinition) {
    const response = await axios.get(definition.url, {
      timeout: GEOREF_REQUEST_TIMEOUT_MS,
      maxRedirects: 5,
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024,
      responseType: 'json',
      headers: { 'User-Agent': 'Chaman2026/lot-administrative-location' },
    });
    const body =
      typeof response.data === 'string'
        ? JSON.parse(response.data)
        : response.data;
    const features = (body?.features || []) as GeoJsonFeature[];
    if (features.length < definition.minimumCount) {
      throw new Error(
        `${definition.resource}: GeoRef devolvio ${features.length} entidades; minimo esperado ${definition.minimumCount}.`,
      );
    }
    for (const feature of features) {
      if (
        !feature?.properties?.id ||
        !feature.properties.nombre ||
        !feature.geometry
      ) {
        throw new Error(
          `${definition.resource}: entidad sin id, nombre o geometria.`,
        );
      }
      if (!definition.geometryTypes.includes(feature.geometry.type)) {
        throw new Error(
          `${definition.resource}: geometria ${feature.geometry.type} no soportada.`,
        );
      }
    }
    return {
      definition,
      features,
      etag: response.headers.etag,
      lastModified: response.headers['last-modified'],
      checksum: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    };
  }

  private mapFeature(
    snapshotId: string,
    definition: ResourceDefinition,
    feature: GeoJsonFeature,
    sourceUpdatedAt?: string,
  ) {
    const attributes = feature.properties || {};
    const sourceGeometryHash = createHash('sha256')
      .update(JSON.stringify(feature.geometry))
      .digest('hex');
    const repaired = this.normalizeSourceGeometry(feature.geometry);
    const geometry = repaired.geometry;
    const centroidCoordinates = this.getCentroidCoordinates(
      attributes,
      geometry,
    );
    return {
      snapshotId,
      resource: definition.resource,
      entityId: `${attributes.id}`,
      name: `${attributes.nombre}`,
      fullName: attributes.nombre_completo,
      category: attributes.categoria,
      source: attributes.fuente,
      province: this.mapReference(attributes.provincia),
      department: this.mapReference(attributes.departamento),
      localGovernment: this.mapReference(
        attributes.gobierno_local || attributes.municipio,
      ),
      censusLocality: this.mapReference(attributes.localidad_censal),
      geometry,
      centroid: centroidCoordinates
        ? { type: 'Point' as const, coordinates: centroidCoordinates }
        : undefined,
      originalAttributes: attributes,
      sourceUrl: definition.url,
      sourceUpdatedAt,
      contentHash: createHash('sha256')
        .update(JSON.stringify({ geometry, attributes }))
        .digest('hex'),
      sourceGeometryHash,
      geometryRepair: repaired.repaired
        ? {
            repaired: true,
            removedRings: repaired.removedRings,
            removedPolygons: repaired.removedPolygons,
            promotedRings: repaired.promotedRings,
          }
        : { repaired: false },
      license: 'CC BY 4.0',
      attribution: 'Servicio Georef - argentina.gob.ar/georef',
    };
  }

  private normalizeSourceGeometry(geometry: GeoJsonFeature['geometry']): {
    geometry: GeoJsonFeature['geometry'];
    repaired: boolean;
    removedRings: number;
    removedPolygons: number;
    promotedRings: number;
  } {
    if (geometry.type === 'MultiPoint') {
      const coordinates = geometry.coordinates as [number, number][];
      if (!coordinates?.length) throw new Error('Geometria MultiPoint vacia.');
      return {
        geometry: { type: 'Point', coordinates: coordinates[0] },
        repaired: false,
        removedRings: 0,
        removedPolygons: 0,
        promotedRings: 0,
      };
    }
    if (geometry.type === 'Point') {
      return {
        geometry,
        repaired: false,
        removedRings: 0,
        removedPolygons: 0,
        promotedRings: 0,
      };
    }

    const polygons =
      geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : (geometry.coordinates as any[]);
    let removedRings = 0;
    let removedPolygons = 0;
    let promotedRings = 0;
    const cleanPolygons: any[] = [];
    for (const polygon of polygons as any[]) {
      if (!Array.isArray(polygon) || !polygon.length) {
        removedPolygons++;
        continue;
      }
      const outer = this.cleanSourceRing(polygon[0]);
      if (!outer) {
        removedRings += polygon.length;
        removedPolygons++;
        continue;
      }
      const rings: any[] = [outer];
      const promoted: any[] = [];
      for (const ring of polygon.slice(1)) {
        const clean = this.cleanSourceRing(ring);
        if (!clean) {
          removedRings++;
          continue;
        }
        if (this.isContainedRing(clean, outer)) {
          rings.push(clean);
        } else {
          promoted.push([clean]);
          promotedRings++;
        }
      }
      cleanPolygons.push(rings);
      cleanPolygons.push(...promoted);
    }
    if (!cleanPolygons.length)
      throw new Error('La geometria oficial no contiene poligonos reparables.');
    return {
      geometry:
        geometry.type === 'Polygon' && cleanPolygons.length === 1
          ? { type: 'Polygon', coordinates: cleanPolygons[0] }
          : { type: 'MultiPolygon', coordinates: cleanPolygons },
      repaired: removedRings > 0 || removedPolygons > 0 || promotedRings > 0,
      removedRings,
      removedPolygons,
      promotedRings,
    };
  }

  private cleanSourceRing(value: any): number[][] | null {
    if (!Array.isArray(value)) return null;
    const ring: number[][] = [];
    for (const item of value) {
      const lon = Number(item?.[0]);
      const lat = Number(item?.[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const position = [lon, lat];
      const previous = ring[ring.length - 1];
      if (!previous || previous[0] !== lon || previous[1] !== lat)
        ring.push(position);
    }
    if (
      ring.length &&
      (ring[0][0] !== ring[ring.length - 1][0] ||
        ring[0][1] !== ring[ring.length - 1][1])
    ) {
      ring.push([...ring[0]]);
    }
    const unique = new Set(
      ring.slice(0, -1).map((item) => `${item[0]},${item[1]}`),
    );
    return unique.size >= 3 ? ring : null;
  }

  private isContainedRing(inner: number[][], outer: number[][]): boolean {
    try {
      const polygon = feature({ type: 'Polygon', coordinates: [outer] } as any);
      return inner.slice(0, -1).every((position) =>
        booleanPointInPolygon(point(position), polygon, {
          ignoreBoundary: false,
        }),
      );
    } catch {
      return false;
    }
  }

  private getCentroidCoordinates(
    attributes: Record<string, any>,
    geometry: GeoJsonFeature['geometry'],
  ): [number, number] | undefined {
    const lon = Number(attributes.centroide?.lon);
    const lat = Number(attributes.centroide?.lat);
    if (Number.isFinite(lon) && Number.isFinite(lat)) return [lon, lat];
    if (geometry.type === 'Point') {
      const coordinates = geometry.coordinates as [number, number];
      if (
        Number.isFinite(coordinates?.[0]) &&
        Number.isFinite(coordinates?.[1])
      )
        return coordinates;
    }
    return undefined;
  }

  private mapReference(value?: { id?: string; nombre?: string }) {
    if (!value?.id && !value?.nombre) return undefined;
    return { id: value.id ? `${value.id}` : undefined, name: value.nombre };
  }
}
