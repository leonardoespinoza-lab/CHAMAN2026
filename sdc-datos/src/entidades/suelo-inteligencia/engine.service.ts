import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import {
  IFuenteSueloMetadata,
  IInteligenciaSueloLote,
  IPerfilProfundidadSuelo,
  IPropiedadSuelo,
  IResumenInteligenciaSuelo,
  IUnidadSueloLote,
  TMotivoInteligenciaSuelo,
  TTexturaSuelo,
} from 'modelos/src';
import { Model } from 'mongoose';
import { Lote, LoteDocument } from '../lote/modelos/schema';
import { LotGeometryNormalizer } from '../ubicacion-lote/geometry-normalizer.service';
import { LotLocationService } from '../ubicacion-lote/service';
import { INTA_LAYER_REGISTRY_VERSION } from './config/inta-soil-layers';
import {
  SOILGRIDS_ATTRIBUTION,
  SOILGRIDS_LICENSE,
  SOILGRIDS_METADATA_URL,
  SOILGRIDS_RESOLUTION_METERS,
  SOILGRIDS_SOURCE_VERSION,
} from './config/soilgrids.config';
import {
  SOIL_CONFIDENCE_VERSION,
  SoilIntelligenceConfidenceService,
} from './confidence.service';
import { IntaSoilProvider } from './providers/inta-soil.provider';
import { SoilGridsProvider } from './providers/soilgrids.provider';
import { SoilIntelligenceRepository } from './repository';
import {
  TEXTURE_MAPPING_VERSION,
  SoilTextureClassifier,
} from './texture-classifier.service';

export const SOIL_INTELLIGENCE_ENGINE_VERSION = 'lot-soil-v1.0.1';
export const DOMINANT_SOIL_UNIT_THRESHOLD = 60;

@Injectable()
export class LotSoilIntelligenceEngine {
  private readonly logger = new Logger(LotSoilIntelligenceEngine.name);
  private readonly inFlight = new Map<
    string,
    Promise<IInteligenciaSueloLote>
  >();

  constructor(
    @InjectModel(Lote.name) private readonly lots: Model<LoteDocument>,
    private readonly repository: SoilIntelligenceRepository,
    private readonly geometryNormalizer: LotGeometryNormalizer,
    private readonly locationService: LotLocationService,
    private readonly inta: IntaSoilProvider,
    private readonly soilgrids: SoilGridsProvider,
    private readonly classifier: SoilTextureClassifier,
    private readonly confidenceService: SoilIntelligenceConfidenceService,
  ) {}

  async get(loteId: string): Promise<IInteligenciaSueloLote | null> {
    const current = await this.repository.getByLot(loteId);
    return current || this.request(loteId, 'lazy_read');
  }

  async request(
    loteId: string,
    reason: TMotivoInteligenciaSuelo,
    options: { immediate?: boolean; force?: boolean } = {},
  ): Promise<IInteligenciaSueloLote> {
    const lot = await this.lots.findById(loteId).lean();
    if (!lot) throw new NotFoundException('Lote no encontrado');

    let geometry;
    try {
      geometry = this.geometryNormalizer.normalize(lot.ubicacion);
    } catch (error) {
      const noGeometry =
        !lot.ubicacion?.geojson?.coordinates?.length &&
        !lot.ubicacion?.poligono?.length;
      return this.repository.prepare({
        loteId,
        status: noGeometry ? 'missing_geometry' : 'invalid_geometry',
        geometryHash: createHash('sha256')
          .update(JSON.stringify(lot.ubicacion || {}))
          .digest('hex'),
        engineVersion: SOIL_INTELLIGENCE_ENGINE_VERSION,
        mappingVersion: TEXTURE_MAPPING_VERSION,
        reason,
        requestedAt: new Date().toISOString(),
        warnings: [error?.message || `${error}`],
      });
    }

    const resolutionKey = this.resolutionKey(loteId, geometry.geometryHash);
    const existing = await this.repository.getByLot(loteId);
    if (
      existing &&
      !options.force &&
      existing.resolutionKey === resolutionKey &&
      ['ready', 'no_coverage'].includes(existing.status)
    ) {
      return existing;
    }
    const running = this.inFlight.get(resolutionKey);
    if (running) return options.immediate ? running : (existing as any);

    const pending = await this.repository.prepare({
      loteId,
      status: options.immediate ? 'processing' : 'pending',
      geometryHash: geometry.geometryHash,
      resolutionKey,
      engineVersion: SOIL_INTELLIGENCE_ENGINE_VERSION,
      mappingVersion: TEXTURE_MAPPING_VERSION,
      reason,
      requestedAt: new Date().toISOString(),
      processingStartedAt: options.immediate
        ? new Date().toISOString()
        : undefined,
      attempts: (existing?.attempts || 0) + 1,
      warnings: geometry.warnings,
    });
    const task = this.process({ lot, geometry, resolutionKey, reason });
    this.inFlight.set(resolutionKey, task);
    void task.then(
      () => this.inFlight.delete(resolutionKey),
      async (error) => {
        this.inFlight.delete(resolutionKey);
        await this.repository.complete(loteId, {
          status: 'failed',
          warnings: [error?.message || `${error}`],
          calculatedAt: new Date().toISOString(),
        });
        this.logger.error(
          JSON.stringify({
            event: 'soil_intelligence_failed',
            loteId,
            resolutionKey,
            error: error?.message || `${error}`,
          }),
        );
      },
    );
    return options.immediate ? task : pending;
  }

  async backfill(limit = 0): Promise<{
    total: number;
    ready: number;
    partial: number;
    failed: number;
  }> {
    const query = this.lots
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
    let ready = 0;
    let partial = 0;
    let failed = 0;
    for (const lot of lots) {
      try {
        const result = await this.request(`${lot._id}`, 'backfill', {
          immediate: true,
        });
        if (result.status === 'ready') ready++;
        else if (result.status === 'partial') partial++;
        else failed++;
      } catch {
        failed++;
      }
    }
    return { total: lots.length, ready, partial, failed };
  }

  private async process(input: {
    lot: any;
    geometry: ReturnType<LotGeometryNormalizer['normalize']>;
    resolutionKey: string;
    reason: TMotivoInteligenciaSuelo;
  }): Promise<IInteligenciaSueloLote> {
    await this.repository.complete(`${input.lot._id}`, {
      status: 'processing',
      processingStartedAt: new Date().toISOString(),
    });
    const location = await this.locationService.getCurrent(`${input.lot._id}`);
    const province = location?.provincia?.nombre;
    const [intaResult, soilGridsResult] = await Promise.all([
      this.inta.assess(input.geometry, province),
      this.soilgrids.assess(input.geometry),
    ]);
    const topsoil = this.topsoil(soilGridsResult.profile);
    const operationalTexture = this.operationalTexture(input.lot);
    const operationalSource = operationalTexture
      ? input.lot.sueloProcedencia || 'manual'
      : undefined;
    const estimatedTexture = intaResult.directTexture || topsoil?.texture;
    const manualConflict = !!(
      operationalTexture &&
      estimatedTexture &&
      operationalTexture !== estimatedTexture
    );
    const heterogeneous = this.isHeterogeneous(intaResult.units);
    const confidence = this.confidenceService.calculate({
      geometry: input.geometry,
      inta: intaResult,
      soilgrids: soilGridsResult,
      intaTexture: intaResult.directTexture,
      soilgridsTexture: topsoil?.texture,
      heterogeneous,
    });
    const sourceType =
      intaResult.units.length && soilGridsResult.profile.length
        ? 'mixed'
        : intaResult.units.length
          ? 'inta'
          : soilGridsResult.profile.length
            ? 'soilgrids'
            : operationalTexture
              ? operationalSource === 'laboratory'
                ? 'laboratory'
                : 'manual'
              : 'unknown';
    const dominantUnit = intaResult.units[0];
    const availableWater = this.weightedMetric(
      soilGridsResult.profile,
      'availableWaterMmPerMeter',
      0,
      100,
    );
    const effectiveDepth = this.effectiveDepth(dominantUnit);
    const summary: IResumenInteligenciaSuelo = {
      operationalTexture: operationalTexture || estimatedTexture,
      operationalTextureSource:
        operationalSource || this.estimatedTextureSource(intaResult.units),
      estimatedTexture,
      canonicalTexture: estimatedTexture,
      usdaTexture: topsoil?.usda,
      originalTexture: intaResult.directTextureOriginal,
      originalTextureSystem: intaResult.directTextureOriginal
        ? 'INTA / atributo directo'
        : topsoil
          ? 'USDA'
          : undefined,
      depthFromCm: 0,
      depthToCm: 30,
      sandPercentage: topsoil?.sand,
      siltPercentage: topsoil?.silt,
      clayPercentage: topsoil?.clay,
      drainageClass:
        intaResult.units.find(
          (unit) => unit.drainageClass && unit.drainageClass !== 'unknown',
        )?.drainageClass || 'unknown',
      availableWaterMmPerMeter: availableWater,
      rootZoneAvailableWaterMm: Number.isFinite(availableWater)
        ? this.round(availableWater! * (effectiveDepth / 100))
        : undefined,
      effectiveDepthCm: effectiveDepth,
      ph: this.weightedMetric(soilGridsResult.profile, 'phWater', 0, 30),
      organicCarbonGKg: this.weightedMetric(
        soilGridsResult.profile,
        'organicCarbonGKg',
        0,
        30,
      ),
      organicMatterEstimatedPercentage: this.weightedMetric(
        soilGridsResult.profile,
        'organicMatterEstimatedPercentage',
        0,
        30,
      ),
      cecCmolKg: this.weightedMetric(
        soilGridsResult.profile,
        'cecCmolKg',
        0,
        30,
      ),
      bulkDensityKgDm3: this.weightedMetric(
        soilGridsResult.profile,
        'bulkDensityKgDm3',
        0,
        30,
      ),
      coarseFragmentsPercentage: this.weightedMetric(
        soilGridsResult.profile,
        'coarseFragmentsPercentage',
        0,
        30,
      ),
      phosphorusAvailable: {
        value: null,
        unit: 'mg/kg',
        source: 'unknown',
        method:
          'Requiere análisis de laboratorio con método y profundidad identificados',
        observedOrEstimated: 'unknown',
        confidence: 'unavailable',
      },
    };
    const warnings = [
      ...input.geometry.warnings,
      ...intaResult.warnings,
      ...soilGridsResult.warnings,
      ...(manualConflict
        ? [
            `La textura operativa ${operationalTexture} se conserva; la estimación automática es ${estimatedTexture}.`,
          ]
        : []),
      ...(dominantUnit && !intaResult.directTexture
        ? [
            'INTA informó unidad o taxonomía pero no una textura directa; la composición se completó con SoilGrids.',
          ]
        : []),
      'Fósforo disponible: no medido. Solo se informará a partir de un análisis de laboratorio identificado.',
    ];
    const hasAutomatic = !!(
      intaResult.units.length || soilGridsResult.profile.length
    );
    const status = hasAutomatic
      ? intaResult.failedLayers.length || !soilGridsResult.profile.length
        ? 'partial'
        : 'ready'
      : operationalTexture
        ? 'partial'
        : 'no_coverage';
    const sources = this.sources(
      intaResult.units,
      soilGridsResult.profile.length > 0,
      intaResult.coveragePercentage,
      soilGridsResult.coveragePercentage,
      confidence.level,
      confidence.score,
      confidence.factors,
    );
    const calculatedAt = new Date().toISOString();
    const result = await this.repository.complete(`${input.lot._id}`, {
      status,
      geometryHash: input.geometry.geometryHash,
      resolutionKey: input.resolutionKey,
      summary,
      taxonomy: {
        intaUnit: dominantUnit?.unitName || dominantUnit?.unitSymbol,
        series: dominantUnit?.seriesName,
        order: dominantUnit?.taxonomy?.order,
        suborder: dominantUnit?.taxonomy?.suborder,
        greatGroup: dominantUnit?.taxonomy?.greatGroup,
        subgroup: dominantUnit?.taxonomy?.subgroup,
        capabilityClass: dominantUnit?.capabilityClass,
      },
      source: {
        type: sourceType,
        provider:
          sourceType === 'mixed' ? 'INTA + ISRIC' : sources[0]?.provider,
        coveragePercentage: Math.max(
          intaResult.coveragePercentage,
          soilGridsResult.coveragePercentage,
        ),
        resolutionMeters: soilGridsResult.profile.length
          ? SOILGRIDS_RESOLUTION_METERS
          : undefined,
        confidence: confidence.level,
        confidenceScore: confidence.score,
        confidenceFactors: confidence.factors,
        calculatedAt,
        sourceVersion: `${INTA_LAYER_REGISTRY_VERSION}; ${SOILGRIDS_SOURCE_VERSION}`,
      },
      sources,
      depthProfile: soilGridsResult.profile,
      soilUnits: intaResult.units,
      propertyProvenance: this.provenance(summary, intaResult.units),
      coveragePercentage: Math.max(
        intaResult.coveragePercentage,
        soilGridsResult.coveragePercentage,
      ),
      heterogeneityFlag: heterogeneous,
      manualConflict,
      engineVersion: SOIL_INTELLIGENCE_ENGINE_VERSION,
      mappingVersion: TEXTURE_MAPPING_VERSION,
      sourceVersions: {
        ...intaResult.sourceVersions,
        soilgrids: SOILGRIDS_SOURCE_VERSION,
        confidence: SOIL_CONFIDENCE_VERSION,
      },
      warnings: [...new Set(warnings)],
      qualityFlags: [
        'Estadística zonal calculada sobre el polígono completo.',
        'Propiedades SoilGrids convertidas desde enteros escalados a unidades convencionales.',
        `Mapeo textural ${TEXTURE_MAPPING_VERSION}.`,
        ...new Set(
          soilGridsResult.profile.flatMap((layer) => layer.qualityFlags || []),
        ),
      ],
      reason: input.reason,
      calculatedAt,
    });
    await this.completeOperationalSoilIfEmpty(input.lot, summary);
    this.logger.log(
      JSON.stringify({
        event: 'soil_intelligence_completed',
        loteId: `${input.lot._id}`,
        status,
        source: sourceType,
        confidence: confidence.level,
        confidenceScore: confidence.score,
        depthLayers: soilGridsResult.profile.length,
        soilUnits: intaResult.units.length,
        engineVersion: SOIL_INTELLIGENCE_ENGINE_VERSION,
      }),
    );
    return result;
  }

  private topsoil(profile: IPerfilProfundidadSuelo[]):
    | {
        sand: number;
        silt: number;
        clay: number;
        texture: TTexturaSuelo;
        usda: any;
      }
    | undefined {
    const layers = profile
      .filter(
        (layer) =>
          Number.isFinite(layer.sandQ50) &&
          Number.isFinite(layer.siltQ50) &&
          Number.isFinite(layer.clayQ50),
      )
      .map((layer) => ({
        depthFromCm: layer.depthFromCm,
        depthToCm: layer.depthToCm,
        sand: layer.sandQ50!,
        silt: layer.siltQ50!,
        clay: layer.clayQ50!,
      }));
    if (!layers.length) return undefined;
    try {
      const fractions = this.classifier.weightedTopsoil(layers);
      const classification = this.classifier.classify(
        fractions.sand,
        fractions.silt,
        fractions.clay,
      );
      return {
        sand: this.round(fractions.sand),
        silt: this.round(fractions.silt),
        clay: this.round(fractions.clay),
        texture: classification.chaman,
        usda: classification.usda,
      };
    } catch {
      return undefined;
    }
  }

  private operationalTexture(lot: any): TTexturaSuelo | undefined {
    return (
      lot.texturaEscorrentia ||
      lot.texturaLixiviacion ||
      lot.suelos?.find((layer) => !!layer.textura)?.textura
    );
  }

  private estimatedTextureSource(
    units: IUnidadSueloLote[],
  ): 'inta_local' | 'inta_national' | 'soilgrids' {
    const direct = units.find((unit) => !!unit.canonicalTexture);
    return direct?.source === 'inta_local'
      ? 'inta_local'
      : direct
        ? 'inta_national'
        : 'soilgrids';
  }

  private isHeterogeneous(units: IUnidadSueloLote[]): boolean {
    if (units.length <= 1) return false;
    const byLayer = new Map<string, IUnidadSueloLote[]>();
    for (const unit of units) {
      const key = unit.layerId || 'unknown';
      byLayer.set(key, [...(byLayer.get(key) || []), unit]);
    }
    // La heterogeneidad se evalua sobre la cartografia mas detallada. Una
    // capa nacional puede cubrir mas superficie, pero no debe desplazar una
    // capa local/regional disponible para el mismo lote.
    const sourcePriority = (group: IUnidadSueloLote[]): number =>
      group.some((unit) => unit.source === 'inta_local') ? 2 : 1;
    const mostDetailed = [...byLayer.values()].sort(
      (left, right) => sourcePriority(right) - sourcePriority(left),
    )[0];
    if (!mostDetailed || mostDetailed.length <= 1) return false;
    const dominant = Math.max(
      ...mostDetailed.map((unit) => unit.areaPercentage || 0),
    );
    return dominant < DOMINANT_SOIL_UNIT_THRESHOLD;
  }

  private effectiveDepth(unit?: IUnidadSueloLote): number {
    const raw = unit?.rawAttributes || {};
    const value = Number(
      raw['profund_s1'] || raw['profundidad'] || raw['depth_cm'],
    );
    return Number.isFinite(value) && value > 0
      ? Math.min(200, Math.max(20, value))
      : 100;
  }

  private weightedMetric(
    profile: IPerfilProfundidadSuelo[],
    key: keyof IPerfilProfundidadSuelo,
    fromCm: number,
    toCm: number,
  ): number | undefined {
    let total = 0;
    let depth = 0;
    for (const layer of profile) {
      const value = Number(layer[key]);
      const overlap = Math.max(
        0,
        Math.min(layer.depthToCm, toCm) - Math.max(layer.depthFromCm, fromCm),
      );
      if (!Number.isFinite(value) || overlap <= 0) continue;
      total += value * overlap;
      depth += overlap;
    }
    return depth > 0 ? this.round(total / depth) : undefined;
  }

  private sources(
    units: IUnidadSueloLote[],
    hasSoilGrids: boolean,
    intaCoverage: number,
    soilGridsCoverage: number,
    confidence: any,
    score: number,
    factors: string[],
  ): IFuenteSueloMetadata[] {
    const calculatedAt = new Date().toISOString();
    const result: IFuenteSueloMetadata[] = [];
    for (const layerId of [
      ...new Set(units.map((unit) => unit.layerId).filter(Boolean)),
    ]) {
      const sample = units.find((unit) => unit.layerId === layerId);
      result.push({
        type: 'inta',
        provider: 'INTA Digital GEO',
        dataset: layerId,
        layerId,
        scale: sample?.sourceScale,
        coveragePercentage: intaCoverage,
        confidence,
        confidenceScore: score,
        confidenceFactors: factors,
        sourceVersion: sample?.sourceVersion,
        calculatedAt,
        attribution: 'INTA Digital GEO',
        license: 'Sujeto a metadatos de la capa INTA',
        metadataUrl: 'https://geo.inta.gob.ar/',
      });
    }
    if (hasSoilGrids) {
      result.push({
        type: 'soilgrids',
        provider: 'ISRIC — World Soil Information',
        dataset: 'SoilGrids250m 2.0',
        resolutionMeters: SOILGRIDS_RESOLUTION_METERS,
        coveragePercentage: soilGridsCoverage,
        confidence,
        confidenceScore: score,
        confidenceFactors: factors,
        sourceVersion: SOILGRIDS_SOURCE_VERSION,
        calculatedAt,
        attribution: SOILGRIDS_ATTRIBUTION,
        license: SOILGRIDS_LICENSE,
        metadataUrl: SOILGRIDS_METADATA_URL,
      });
    }
    return result;
  }

  private provenance(
    summary: IResumenInteligenciaSuelo,
    units: IUnidadSueloLote[],
  ): Record<string, IPropiedadSuelo<unknown>> {
    const textureSource = this.estimatedTextureSource(units);
    const estimated = (
      value: unknown,
      unit: string,
      source: 'soilgrids' | 'inta_local' | 'inta_national' = 'soilgrids',
      method = 'estadística zonal ponderada por superficie',
    ): IPropiedadSuelo<unknown> => ({
      value,
      unit,
      source,
      method,
      depthFromCm: 0,
      depthToCm: 30,
      observedOrEstimated: 'estimated',
      confidence: source === 'soilgrids' ? 'medium' : 'medium',
      sourceVersion:
        source === 'soilgrids'
          ? SOILGRIDS_SOURCE_VERSION
          : INTA_LAYER_REGISTRY_VERSION,
    });
    return {
      canonicalTexture: estimated(
        summary.estimatedTexture,
        'clase',
        textureSource,
        'USDA completo + reducción Chaman-7',
      ),
      sandPercentage: estimated(summary.sandPercentage, '%'),
      siltPercentage: estimated(summary.siltPercentage, '%'),
      clayPercentage: estimated(summary.clayPercentage, '%'),
      availableWaterMmPerMeter: estimated(
        summary.availableWaterMmPerMeter,
        'mm/m',
        'soilgrids',
        'agua 33 kPa menos agua 1500 kPa',
      ),
      phosphorusAvailable: summary.phosphorusAvailable as any,
    };
  }

  private async completeOperationalSoilIfEmpty(
    lot: any,
    summary: IResumenInteligenciaSuelo,
  ): Promise<void> {
    if (this.operationalTexture(lot) || !summary.estimatedTexture) return;
    const update: Record<string, unknown> = {
      texturaLixiviacion: summary.estimatedTexture,
      texturaEscorrentia: summary.estimatedTexture,
      sueloProcedencia: summary.operationalTextureSource || 'derived',
      sueloConfirmadoPorUsuario: false,
    };
    const top = summary;
    if (
      !Number.isFinite(lot.capacidadDeCampo) &&
      Number.isFinite(top.availableWaterMmPerMeter)
    ) {
      const profile = await this.repository.getByLot(`${lot._id}`);
      const first = profile?.depthProfile?.[0];
      if (Number.isFinite(first?.fieldCapacityPercentage)) {
        update.capacidadDeCampo = first!.fieldCapacityPercentage;
      }
      if (Number.isFinite(first?.wiltingPointPercentage)) {
        update.puntoMarchitez = first!.wiltingPointPercentage;
      }
    }
    if (!lot.suelos?.length) {
      update.suelos = [
        {
          profundidad: 30,
          textura: summary.estimatedTexture,
          hayRaices: true,
          capacidadDeCampo: update.capacidadDeCampo,
          puntoMarchitez: update.puntoMarchitez,
        },
      ];
    }
    await this.lots.updateOne({ _id: lot._id }, { $set: update });
  }

  private resolutionKey(loteId: string, geometryHash: string): string {
    return createHash('sha256')
      .update(
        [
          loteId,
          geometryHash,
          SOIL_INTELLIGENCE_ENGINE_VERSION,
          TEXTURE_MAPPING_VERSION,
          INTA_LAYER_REGISTRY_VERSION,
          SOILGRIDS_SOURCE_VERSION,
        ].join(':'),
      )
      .digest('hex');
  }

  private round(value: number, digits = 2): number {
    return Number(value.toFixed(digits));
  }
}
