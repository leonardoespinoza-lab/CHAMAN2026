import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { area, bbox, feature, featureCollection, intersect } from '@turf/turf';
import {
  IUnidadSueloLote,
  TConfianzaInteligenciaSuelo,
  TTexturaSuelo,
} from 'modelos/src';
import { NormalizedLotGeometry } from '../../ubicacion-lote/geometry-normalizer.service';
import {
  INTA_LAYER_REGISTRY_VERSION,
  INTA_SOIL_LAYERS,
  IntaSoilLayerDefinition,
} from '../config/inta-soil-layers';
import { IntaSoilTextNormalizer } from '../inta-normalizer.service';
import { IntaSoilProviderResult } from './provider.types';

interface FeatureCollectionResponse {
  features?: Array<{
    id?: string;
    geometry?: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: unknown;
    };
    properties?: Record<string, unknown>;
  }>;
}

@Injectable()
export class IntaSoilProvider {
  private readonly logger = new Logger(IntaSoilProvider.name);
  private readonly cache = new Map<
    string,
    { expiresAt: number; response: FeatureCollectionResponse }
  >();

  constructor(private readonly normalizer: IntaSoilTextNormalizer) {}

  async assess(
    geometry: NormalizedLotGeometry,
    province?: string,
  ): Promise<IntaSoilProviderResult> {
    const normalizedProvince = this.normalizer.normalize(province);
    const layers = INTA_SOIL_LAYERS.filter(
      (layer) =>
        layer.provinces.includes('*') ||
        layer.provinces.includes(normalizedProvince),
    ).sort((left, right) => right.priority - left.priority);
    const units: IUnidadSueloLote[] = [];
    const warnings: string[] = [];
    const failedLayers: string[] = [];
    const sourceVersions: Record<string, string> = {
      registry: INTA_LAYER_REGISTRY_VERSION,
    };

    for (const layer of layers) {
      try {
        const response = await this.fetchLayer(layer, geometry);
        sourceVersions[layer.id] = layer.sourceVersion;
        units.push(...this.intersections(response, layer, geometry));
      } catch (error) {
        failedLayers.push(layer.id);
        warnings.push(
          `INTA no respondió para ${layer.id}; se conservan las demás fuentes disponibles.`,
        );
        this.logger.warn(
          `Capa INTA ${layer.id} no disponible: ${error?.message || error}`,
        );
      }
    }

    units.sort((left, right) => {
      const priorityLeft =
        layers.find((layer) => layer.id === left.layerId)?.priority || 0;
      const priorityRight =
        layers.find((layer) => layer.id === right.layerId)?.priority || 0;
      if (priorityLeft !== priorityRight) return priorityRight - priorityLeft;
      return (right.areaPercentage || 0) - (left.areaPercentage || 0);
    });

    const direct = this.selectDirectTexture(units, layers);
    const coveragePercentage = this.coverage(units, layers);
    const confidence = this.confidence(
      units,
      layers,
      coveragePercentage,
      direct?.canonicalTexture,
    );

    return {
      units,
      coveragePercentage,
      directTexture: direct?.canonicalTexture,
      directTextureOriginal: direct?.originalTexture,
      confidence,
      sourceVersions,
      warnings,
      failedLayers,
    };
  }

  private async fetchLayer(
    layer: IntaSoilLayerDefinition,
    geometry: NormalizedLotGeometry,
  ): Promise<FeatureCollectionResponse> {
    const bounds = bbox(feature(geometry.geometry as any));
    const cacheKey = `${layer.id}:${geometry.geometryHash}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.response;

    const response = await axios.get<FeatureCollectionResponse>(
      layer.endpoint,
      {
        timeout: Number(process.env.SOIL_INTA_TIMEOUT_MS || 20_000),
        params: {
          service: 'WFS',
          version: '2.0.0',
          request: 'GetFeature',
          typeNames: layer.layerName,
          outputFormat: 'application/json',
          srsName: 'EPSG:4326',
          bbox: `${bounds.join(',')},EPSG:4326`,
          count: Number(process.env.SOIL_INTA_MAX_FEATURES || 250),
        },
        headers: { Accept: 'application/json' },
      },
    );
    const data = response.data || {};
    this.cache.set(cacheKey, {
      response: data,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    return data;
  }

  private intersections(
    response: FeatureCollectionResponse,
    layer: IntaSoilLayerDefinition,
    geometry: NormalizedLotGeometry,
  ): IUnidadSueloLote[] {
    const lotFeature = feature(geometry.geometry as any);
    const result: IUnidadSueloLote[] = [];
    for (const candidate of response.features || []) {
      if (!candidate.geometry) continue;
      try {
        const overlap = intersect(
          featureCollection([lotFeature, feature(candidate.geometry as any)]),
        );
        if (!overlap) continue;
        const areaM2 = area(overlap);
        if (!Number.isFinite(areaM2) || areaM2 <= 0) continue;
        const properties = candidate.properties || {};
        const originalTexture = this.stringValue(
          properties,
          layer.fields.texture,
        );
        result.push({
          source: layer.priority > 50 ? 'inta_local' : 'inta_national',
          sourceFeatureId:
            this.stringValue(properties, layer.fields.featureId) ||
            candidate.id,
          layerId: layer.id,
          unitSymbol: this.stringValue(properties, layer.fields.unitSymbol),
          unitName: this.stringValue(properties, layer.fields.unitName),
          seriesName: this.stringValue(properties, layer.fields.series),
          taxonomy: {
            order: this.stringValue(properties, layer.fields.order),
            suborder: this.stringValue(properties, layer.fields.suborder),
            greatGroup: this.stringValue(properties, layer.fields.greatGroup),
            subgroup: this.stringValue(properties, layer.fields.subgroup),
          },
          originalTexture,
          originalTextureSystem: originalTexture
            ? 'INTA / atributo de capa'
            : undefined,
          canonicalTexture:
            this.normalizer.normalizeTexture(originalTexture) || undefined,
          drainageOriginal: this.stringValue(properties, layer.fields.drainage),
          drainageClass: this.normalizer.normalizeDrainage(
            this.stringValue(properties, layer.fields.drainage),
          ),
          capabilityClass: this.stringValue(
            properties,
            layer.fields.capability,
          ),
          limitations: (layer.fields.limitations || [])
            .map((field) => this.stringValue(properties, field))
            .filter((value): value is string => !!value && value !== '-'),
          rawAttributes: properties,
          areaHectares: Number((areaM2 / 10_000).toFixed(4)),
          areaPercentage: Number(
            Math.min(100, (areaM2 / geometry.areaM2) * 100).toFixed(3),
          ),
          sourceScale: layer.scale,
          sourceVersion: layer.sourceVersion,
        });
      } catch {
        continue;
      }
    }
    return result;
  }

  private selectDirectTexture(
    units: IUnidadSueloLote[],
    layers: IntaSoilLayerDefinition[],
  ): IUnidadSueloLote | undefined {
    return units
      .filter((unit) => !!unit.canonicalTexture)
      .sort((left, right) => {
        const priorityLeft =
          layers.find((layer) => layer.id === left.layerId)?.priority || 0;
        const priorityRight =
          layers.find((layer) => layer.id === right.layerId)?.priority || 0;
        const scoreLeft = priorityLeft * 100 + (left.areaPercentage || 0);
        const scoreRight = priorityRight * 100 + (right.areaPercentage || 0);
        return scoreRight - scoreLeft;
      })[0];
  }

  private coverage(
    units: IUnidadSueloLote[],
    layers: IntaSoilLayerDefinition[],
  ): number {
    const highestPriority = Math.max(
      0,
      ...units.map(
        (unit) =>
          layers.find((layer) => layer.id === unit.layerId)?.priority || 0,
      ),
    );
    const total = units
      .filter(
        (unit) =>
          (layers.find((layer) => layer.id === unit.layerId)?.priority || 0) ===
          highestPriority,
      )
      .reduce((sum, unit) => sum + (unit.areaPercentage || 0), 0);
    return Number(Math.min(100, total).toFixed(2));
  }

  private confidence(
    units: IUnidadSueloLote[],
    layers: IntaSoilLayerDefinition[],
    coverage: number,
    texture?: TTexturaSuelo,
  ): TConfianzaInteligenciaSuelo {
    if (!units.length) return 'unavailable';
    const maxPriority = Math.max(
      ...units.map(
        (unit) =>
          layers.find((layer) => layer.id === unit.layerId)?.priority || 0,
      ),
    );
    if (maxPriority >= 85 && coverage >= 80 && texture) return 'high';
    if (coverage >= 60) return 'medium';
    return 'low';
  }

  private stringValue(
    properties: Record<string, unknown>,
    field?: string,
  ): string | undefined {
    if (!field) return undefined;
    const value = properties[field];
    if (value === null || value === undefined || `${value}`.trim() === '') {
      return undefined;
    }
    return `${value}`.trim();
  }
}
