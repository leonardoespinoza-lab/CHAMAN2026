import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  area,
  bbox,
  feature,
  featureCollection,
  intersect,
  polygon,
} from '@turf/turf';
import {
  IPerfilProfundidadSuelo,
  TConfianzaInteligenciaSuelo,
} from 'modelos/src';
import { NormalizedLotGeometry } from '../../ubicacion-lote/geometry-normalizer.service';
import {
  SOILGRIDS_ATTRIBUTION,
  SOILGRIDS_DEPTHS,
  SOILGRIDS_PROPERTIES,
  SOILGRIDS_RESOLUTION_METERS,
  SOILGRIDS_SOURCE_VERSION,
  SoilGridsPropertyCode,
} from '../config/soilgrids.config';
import { SoilTextureClassifier } from '../texture-classifier.service';
import { SoilGridsProviderResult } from './provider.types';

type SoilGridsQuantile = 'Q0.05' | 'Q0.5' | 'Q0.95';

export const SOILGRIDS_TEXTURE_CLOSURE_MAX_DEVIATION = 15;

interface RasterStatistics {
  weightedMean: number;
  median: number;
  spatialLow: number;
  spatialHigh: number;
  standardDeviation: number;
  validPixels: number;
  coveragePercentage: number;
}

interface CoverageResult {
  property: SoilGridsPropertyCode;
  quantile: SoilGridsQuantile;
  stats: RasterStatistics;
}

@Injectable()
export class SoilGridsProvider {
  private readonly logger = new Logger(SoilGridsProvider.name);
  private readonly cache = new Map<
    string,
    { expiresAt: number; stats: RasterStatistics }
  >();

  constructor(private readonly classifier: SoilTextureClassifier) {}

  async assess(
    geometry: NormalizedLotGeometry,
  ): Promise<SoilGridsProviderResult> {
    if (process.env.SOILGRIDS_WCS_ENABLED === 'false') {
      return {
        profile: [],
        coveragePercentage: 0,
        resolutionMeters: SOILGRIDS_RESOLUTION_METERS,
        confidence: 'unavailable',
        sourceVersion: SOILGRIDS_SOURCE_VERSION,
        warnings: ['SoilGrids WCS está deshabilitado por configuración.'],
      };
    }

    const warnings: string[] = [];
    if (geometry.areaM2 < SOILGRIDS_RESOLUTION_METERS ** 2) {
      warnings.push(
        'El lote es menor que la celda de 250 m de SoilGrids; la estimación representa el entorno regional.',
      );
    }

    const profile: IPerfilProfundidadSuelo[] = [];
    for (const depth of SOILGRIDS_DEPTHS) {
      try {
        const layer = await this.readDepth(geometry, depth);
        if (layer) profile.push(layer);
      } catch (error) {
        warnings.push(
          `SoilGrids no pudo completar ${depth.fromCm}–${depth.toCm} cm.`,
        );
        this.logger.warn(
          `SoilGrids ${depth.code} fallo: ${error?.message || error}`,
        );
      }
    }

    const coveragePercentage = profile.length
      ? Math.min(...profile.map((layer) => layer.coveragePercentage || 0))
      : 0;
    const confidence = this.confidence(geometry, profile, coveragePercentage);
    if (!profile.length) {
      warnings.push(
        'SoilGrids no devolvió píxeles válidos para el polígono del lote.',
      );
    }

    return {
      profile,
      coveragePercentage: Number(coveragePercentage.toFixed(2)),
      resolutionMeters: SOILGRIDS_RESOLUTION_METERS,
      confidence,
      sourceVersion: SOILGRIDS_SOURCE_VERSION,
      warnings,
    };
  }

  private async readDepth(
    geometry: NormalizedLotGeometry,
    depth: (typeof SOILGRIDS_DEPTHS)[number],
  ): Promise<IPerfilProfundidadSuelo | null> {
    const textureRequests: Array<() => Promise<CoverageResult>> = (
      ['sand', 'silt', 'clay'] as const
    ).flatMap((property) =>
      (['Q0.05', 'Q0.5', 'Q0.95'] as const).map((quantile) => async () => ({
        property,
        quantile,
        stats: await this.readCoverage(
          geometry,
          property,
          depth.code,
          quantile,
        ),
      })),
    );
    const otherProperties: SoilGridsPropertyCode[] = [
      'bdod',
      'cfvo',
      'phh2o',
      'soc',
      'nitrogen',
      'cec',
      'wv0033',
      'wv1500',
    ];
    const otherRequests: Array<() => Promise<CoverageResult>> =
      otherProperties.map((property) => async () => ({
        property,
        quantile: 'Q0.5' as const,
        stats: await this.readCoverage(geometry, property, depth.code, 'Q0.5'),
      }));
    const results = await this.settledWithLimit(
      [...textureRequests, ...otherRequests],
      Number(process.env.SOILGRIDS_MAX_CONCURRENCY || 5),
    );
    const byKey = new Map<string, RasterStatistics>();
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      byKey.set(
        `${result.value.property}:${result.value.quantile}`,
        result.value.stats,
      );
    }

    const get = (
      property: SoilGridsPropertyCode,
      quantile: SoilGridsQuantile = 'Q0.5',
    ) => byKey.get(`${property}:${quantile}`);
    const sand = get('sand');
    const silt = get('silt');
    const clay = get('clay');
    if (!sand || !silt || !clay) return null;

    const closedTexture = this.closeTextureComposition(
      sand.weightedMean,
      silt.weightedMean,
      clay.weightedMean,
    );
    const classification = this.classifier.classify(
      closedTexture.sand,
      closedTexture.silt,
      closedTexture.clay,
    );
    const fieldCapacity = get('wv0033')?.weightedMean;
    const wiltingPoint = get('wv1500')?.weightedMean;
    const availableWater =
      Number.isFinite(fieldCapacity) && Number.isFinite(wiltingPoint)
        ? Math.max(0, (fieldCapacity! - wiltingPoint!) * 10)
        : undefined;
    const soc = get('soc')?.weightedMean;
    const q05 = (property: 'sand' | 'silt' | 'clay') =>
      get(property, 'Q0.05')?.weightedMean;
    const q95 = (property: 'sand' | 'silt' | 'clay') =>
      get(property, 'Q0.95')?.weightedMean;
    const coverage = Math.min(
      sand.coveragePercentage,
      silt.coveragePercentage,
      clay.coveragePercentage,
    );
    const ratios = (['sand', 'silt', 'clay'] as const)
      .map((property) => {
        const low = q05(property);
        const middle = get(property)?.weightedMean;
        const high = q95(property);
        return Number.isFinite(low) &&
          Number.isFinite(middle) &&
          Number.isFinite(high) &&
          middle! > 0
          ? (high! - low!) / middle!
          : undefined;
      })
      .filter((value): value is number => Number.isFinite(value));
    const uncertaintyRatio = ratios.length
      ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length
      : undefined;

    return {
      depthFromCm: depth.fromCm,
      depthToCm: depth.toCm,
      sandQ05: this.round(q05('sand')),
      sandQ50: this.round(classification.fractions.sand),
      sandQ95: this.round(q95('sand')),
      siltQ05: this.round(q05('silt')),
      siltQ50: this.round(classification.fractions.silt),
      siltQ95: this.round(q95('silt')),
      clayQ05: this.round(q05('clay')),
      clayQ50: this.round(classification.fractions.clay),
      clayQ95: this.round(q95('clay')),
      textureCompositionOriginalSum: this.round(closedTexture.originalSum),
      textureCompositionClosureApplied: closedTexture.closureApplied,
      usdaTexture: classification.usda,
      chamanTexture: classification.chaman,
      bulkDensityKgDm3: this.round(get('bdod')?.weightedMean, 3),
      coarseFragmentsPercentage: this.round(get('cfvo')?.weightedMean),
      phWater: this.round(get('phh2o')?.weightedMean),
      organicCarbonGKg: this.round(soc),
      organicMatterEstimatedPercentage: Number.isFinite(soc)
        ? this.round((soc! / 10) * 1.724)
        : undefined,
      cecCmolKg: this.round(get('cec')?.weightedMean),
      totalNitrogenGKg: this.round(get('nitrogen')?.weightedMean, 3),
      fieldCapacityPercentage: this.round(fieldCapacity),
      wiltingPointPercentage: this.round(wiltingPoint),
      availableWaterMmPerMeter: this.round(availableWater),
      validPixels: Math.min(
        sand.validPixels,
        silt.validPixels,
        clay.validPixels,
      ),
      coveragePercentage: this.round(coverage),
      spatialLow: this.round(
        Math.min(sand.spatialLow, silt.spatialLow, clay.spatialLow),
      ),
      spatialHigh: this.round(
        Math.max(sand.spatialHigh, silt.spatialHigh, clay.spatialHigh),
      ),
      spatialStandardDeviation: this.round(
        (sand.standardDeviation +
          silt.standardDeviation +
          clay.standardDeviation) /
          3,
      ),
      source: 'soilgrids',
      confidence:
        coverage >= 90 &&
        (uncertaintyRatio ?? 99) <= 1 &&
        Math.abs(closedTexture.originalSum - 100) <= 5
          ? 'medium'
          : 'low',
      qualityFlags: [
        `${SOILGRIDS_ATTRIBUTION}; mediana predictiva y estadística zonal ponderada por superficie.`,
        ...(closedTexture.closureApplied
          ? [
              `Cierre composicional SoilGrids aplicado: suma Q0.50 original ${closedTexture.originalSum.toFixed(2)}%, normalizada a 100%.`,
            ]
          : []),
        ...(Number.isFinite(uncertaintyRatio)
          ? [`Incertidumbre relativa media: ${uncertaintyRatio!.toFixed(2)}.`]
          : []),
      ],
    };
  }

  private closeTextureComposition(
    sand: number,
    silt: number,
    clay: number,
  ): {
    sand: number;
    silt: number;
    clay: number;
    originalSum: number;
    closureApplied: boolean;
  } {
    const fractions = [sand, silt, clay];
    if (
      fractions.some(
        (fraction) =>
          !Number.isFinite(fraction) || fraction < 0 || fraction > 100,
      )
    ) {
      throw new Error('Fracciones texturales SoilGrids inválidas.');
    }
    const originalSum = sand + silt + clay;
    if (
      originalSum <= 0 ||
      Math.abs(originalSum - 100) > SOILGRIDS_TEXTURE_CLOSURE_MAX_DEVIATION
    ) {
      throw new Error(
        `Composición SoilGrids fuera de tolerancia: ${originalSum.toFixed(2)}%.`,
      );
    }
    const factor = 100 / originalSum;
    return {
      sand: sand * factor,
      silt: silt * factor,
      clay: clay * factor,
      originalSum,
      closureApplied: Math.abs(originalSum - 100) > 0.01,
    };
  }

  private async readCoverage(
    geometry: NormalizedLotGeometry,
    property: SoilGridsPropertyCode,
    depthCode: string,
    quantile: SoilGridsQuantile,
  ): Promise<RasterStatistics> {
    const cacheKey = `${geometry.geometryHash}:${property}:${depthCode}:${quantile}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.stats;

    const bounds = bbox(feature(geometry.geometry as any));
    const { width, height } = this.rasterDimensions(bounds);
    const coverageId = `${property}_${depthCode}_${quantile}`;
    const response = await axios.get<ArrayBuffer>(
      `https://maps.isric.org/mapserv?map=/map/${property}.map`,
      {
        responseType: 'arraybuffer',
        timeout: Number(process.env.SOILGRIDS_TIMEOUT_MS || 30_000),
        params: {
          SERVICE: 'WCS',
          VERSION: '1.0.0',
          REQUEST: 'GetCoverage',
          COVERAGE: coverageId,
          CRS: 'EPSG:4326',
          BBOX: bounds.join(','),
          WIDTH: width,
          HEIGHT: height,
          FORMAT: 'GEOTIFF_INT16',
        },
      },
    );
    const buffer = this.toArrayBuffer(response.data);
    const { fromArrayBuffer } = await import('geotiff');
    const tiff = await fromArrayBuffer(buffer);
    const image = await tiff.getImage();
    const rasters = await image.readRasters();
    const values = rasters[0] as ArrayLike<number>;
    const imageBounds = image.getBoundingBox();
    const nodata = image.getGDALNoData();
    const stats = this.zonalStatistics({
      values,
      width: image.getWidth(),
      height: image.getHeight(),
      bounds: imageBounds,
      nodata,
      geometry,
      conversionFactor: SOILGRIDS_PROPERTIES[property].conversionFactor,
    });
    this.cache.set(cacheKey, {
      stats,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    return stats;
  }

  private zonalStatistics(input: {
    values: ArrayLike<number>;
    width: number;
    height: number;
    bounds: number[];
    nodata: number | null;
    geometry: NormalizedLotGeometry;
    conversionFactor: number;
  }): RasterStatistics {
    const [minX, minY, maxX, maxY] = input.bounds;
    const stepX = (maxX - minX) / input.width;
    const stepY = (maxY - minY) / input.height;
    const lotFeature = feature(input.geometry.geometry as any);
    const weighted: Array<{ value: number; weight: number }> = [];
    let coveredArea = 0;

    for (let row = 0; row < input.height; row++) {
      for (let column = 0; column < input.width; column++) {
        const raw = Number(input.values[row * input.width + column]);
        if (
          !Number.isFinite(raw) ||
          (Number.isFinite(input.nodata) && raw === input.nodata)
        ) {
          continue;
        }
        const left = minX + column * stepX;
        const right = left + stepX;
        const top = maxY - row * stepY;
        const bottom = top - stepY;
        const cell = polygon([
          [
            [left, bottom],
            [right, bottom],
            [right, top],
            [left, top],
            [left, bottom],
          ],
        ]);
        const overlap = intersect(featureCollection([lotFeature, cell]));
        if (!overlap) continue;
        const overlapArea = area(overlap);
        if (!Number.isFinite(overlapArea) || overlapArea <= 0) continue;
        coveredArea += overlapArea;
        weighted.push({
          value: raw / input.conversionFactor,
          weight: overlapArea,
        });
      }
    }

    if (!weighted.length) {
      throw new Error('Cobertura WCS sin píxeles válidos sobre el polígono.');
    }
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    const mean =
      weighted.reduce((sum, item) => sum + item.value * item.weight, 0) /
      totalWeight;
    const sorted = [...weighted].sort(
      (left, right) => left.value - right.value,
    );
    const percentile = (target: number) => {
      let accumulated = 0;
      for (const item of sorted) {
        accumulated += item.weight;
        if (accumulated / totalWeight >= target) return item.value;
      }
      return sorted[sorted.length - 1].value;
    };
    const variance =
      weighted.reduce(
        (sum, item) => sum + item.weight * (item.value - mean) ** 2,
        0,
      ) / totalWeight;
    return {
      weightedMean: mean,
      median: percentile(0.5),
      spatialLow: percentile(0.1),
      spatialHigh: percentile(0.9),
      standardDeviation: Math.sqrt(variance),
      validPixels: weighted.length,
      coveragePercentage: Math.min(
        100,
        (coveredArea / input.geometry.areaM2) * 100,
      ),
    };
  }

  private rasterDimensions(bounds: number[]): {
    width: number;
    height: number;
  } {
    const [minX, minY, maxX, maxY] = bounds;
    const centerLat = (minY + maxY) / 2;
    const metersPerDegreeLat = 111_320;
    const metersPerDegreeLon =
      metersPerDegreeLat *
      Math.max(0.15, Math.cos((centerLat * Math.PI) / 180));
    const horizontal = Math.max(1, (maxX - minX) * metersPerDegreeLon);
    const vertical = Math.max(1, (maxY - minY) * metersPerDegreeLat);
    return {
      width: Math.max(
        3,
        Math.min(160, Math.ceil(horizontal / SOILGRIDS_RESOLUTION_METERS) + 2),
      ),
      height: Math.max(
        3,
        Math.min(160, Math.ceil(vertical / SOILGRIDS_RESOLUTION_METERS) + 2),
      ),
    };
  }

  private confidence(
    geometry: NormalizedLotGeometry,
    profile: IPerfilProfundidadSuelo[],
    coverage: number,
  ): TConfianzaInteligenciaSuelo {
    if (!profile.length || coverage <= 0) return 'unavailable';
    if (geometry.areaM2 < SOILGRIDS_RESOLUTION_METERS ** 2) return 'low';
    if (coverage >= 90 && profile.length >= 3) return 'medium';
    return 'low';
  }

  private async settledWithLimit<T>(
    tasks: Array<() => Promise<T>>,
    concurrency: number,
  ): Promise<PromiseSettledResult<T>[]> {
    const results: PromiseSettledResult<T>[] = new Array(tasks.length);
    let cursor = 0;
    const workers = Array.from(
      { length: Math.max(1, Math.min(concurrency, tasks.length)) },
      async () => {
        while (cursor < tasks.length) {
          const index = cursor++;
          try {
            results[index] = {
              status: 'fulfilled',
              value: await tasks[index](),
            };
          } catch (reason) {
            results[index] = { status: 'rejected', reason };
          }
        }
      },
    );
    await Promise.all(workers);
    return results;
  }

  private toArrayBuffer(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
    if (data instanceof ArrayBuffer) return data;
    return data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
  }

  private round(value?: number, digits = 2): number | undefined {
    return Number.isFinite(value) ? Number(value!.toFixed(digits)) : undefined;
  }
}
