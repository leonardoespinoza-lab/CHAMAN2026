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
  TConfianzaInteligenciaSuelo,
  TFuentePropiedadSuelo,
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

export const SOIL_INTELLIGENCE_ENGINE_VERSION = 'lot-soil-v1.1.0';
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
    const [current, lot] = await Promise.all([
      this.repository.getByLot(loteId),
      this.lots.findById(loteId).lean(),
    ]);
    if (!lot) throw new NotFoundException('Lote no encontrado');

    try {
      const geometry = this.geometryNormalizer.normalize(lot.ubicacion);
      const expectedResolutionKey = this.resolutionKey(
        loteId,
        geometry.geometryHash,
        lot,
      );
      if (current?.resolutionKey === expectedResolutionKey) return current;
    } catch {
      // request() persiste missing_geometry/invalid_geometry con el detalle
      // de la normalizacion para que la API no entregue una lectura vieja.
    }

    return this.request(loteId, 'lazy_read');
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

    const resolutionKey = this.resolutionKey(
      loteId,
      geometry.geometryHash,
      lot,
    );
    const existing = await this.repository.getByLot(loteId);
    if (
      existing &&
      !options.force &&
      existing.resolutionKey === resolutionKey &&
      ['ready', 'partial', 'no_coverage'].includes(existing.status)
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
      (error) => {
        this.inFlight.delete(resolutionKey);
        void this.persistFailure(loteId, resolutionKey, error);
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

  private async persistFailure(
    loteId: string,
    resolutionKey: string,
    error: any,
  ): Promise<void> {
    try {
      const failed = await this.repository.complete(loteId, resolutionKey, {
        status: 'failed',
        warnings: [error?.message || `${error}`],
        calculatedAt: new Date().toISOString(),
      });
      this.logger.error(
        JSON.stringify(
          failed
            ? {
                event: 'soil_intelligence_failed',
                loteId,
                resolutionKey,
                error: error?.message || `${error}`,
              }
            : {
                event: 'soil_intelligence_discarded',
                loteId,
                resolutionKey,
                phase: 'failed',
              },
        ),
      );
    } catch (persistenceError) {
      this.logger.error(
        JSON.stringify({
          event: 'soil_intelligence_failure_persistence_failed',
          loteId,
          resolutionKey,
          error: persistenceError?.message || `${persistenceError}`,
        }),
      );
    }
  }

  private async process(input: {
    lot: any;
    geometry: ReturnType<LotGeometryNormalizer['normalize']>;
    resolutionKey: string;
    reason: TMotivoInteligenciaSuelo;
  }): Promise<IInteligenciaSueloLote> {
    const processStartedAt = Date.now();
    if (!(await this.isCurrentResolution(input))) {
      return this.discardedResult(input, 'processing');
    }
    const claimed = await this.repository.complete(
      `${input.lot._id}`,
      input.resolutionKey,
      {
        status: 'processing',
        processingStartedAt: new Date().toISOString(),
      },
    );
    if (!claimed) return this.discardedResult(input, 'processing');
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
    if (!(await this.isCurrentResolution(input))) {
      return this.discardedResult(input, 'completion');
    }
    const result = await this.repository.complete(
      `${input.lot._id}`,
      input.resolutionKey,
      {
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
        propertyProvenance: this.provenance(
          summary,
          intaResult.units,
          soilGridsResult.profile,
        ),
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
            soilGridsResult.profile.flatMap(
              (layer) => layer.qualityFlags || [],
            ),
          ),
        ],
        reason: input.reason,
        calculatedAt,
      },
    );
    if (!result) return this.discardedResult(input, 'completion');
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
        durationMs: Date.now() - processStartedAt,
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
    profile: IPerfilProfundidadSuelo[],
  ): Record<string, IPropiedadSuelo<unknown>> {
    const textureSource = this.estimatedTextureSource(units);
    const drainageUnit = units.find(
      (unit) => unit.drainageClass && unit.drainageClass !== 'unknown',
    );
    const dominantUnit = units[0];
    const confidenceForDepth = (
      fromCm: number,
      toCm: number,
    ): TConfianzaInteligenciaSuelo => {
      const rank: Record<TConfianzaInteligenciaSuelo, number> = {
        unavailable: 0,
        low: 1,
        medium: 2,
        high: 3,
      };
      const relevant = profile.filter(
        (layer) => layer.depthToCm > fromCm && layer.depthFromCm < toCm,
      );
      if (!relevant.length) return 'unavailable';
      return relevant.reduce(
        (lowest, layer) =>
          rank[layer.confidence] < rank[lowest] ? layer.confidence : lowest,
        relevant[0].confidence,
      );
    };
    const estimated = (
      value: unknown,
      unit: string,
      source: TFuentePropiedadSuelo = 'soilgrids',
      method = 'estadística zonal ponderada por superficie',
      depthFromCm = 0,
      depthToCm = 30,
      confidence: TConfianzaInteligenciaSuelo = source === 'soilgrids'
        ? confidenceForDepth(depthFromCm, depthToCm)
        : 'medium',
      observedOrEstimated: IPropiedadSuelo['observedOrEstimated'] = 'estimated',
    ): IPropiedadSuelo<unknown> => ({
      value,
      unit,
      source,
      method,
      depthFromCm,
      depthToCm,
      observedOrEstimated:
        value === undefined ? 'unknown' : observedOrEstimated,
      confidence: value === undefined ? 'unavailable' : confidence,
      sourceVersion:
        source === 'soilgrids'
          ? SOILGRIDS_SOURCE_VERSION
          : ['inta_local', 'inta_national'].includes(source)
            ? INTA_LAYER_REGISTRY_VERSION
            : undefined,
    });
    const fieldCapacity = this.weightedMetric(
      profile,
      'fieldCapacityPercentage',
      0,
      100,
    );
    const wiltingPoint = this.weightedMetric(
      profile,
      'wiltingPointPercentage',
      0,
      100,
    );
    return {
      operationalTexture: estimated(
        summary.operationalTexture,
        'clase',
        summary.operationalTextureSource || 'unknown',
        ['laboratory', 'sensor'].includes(
          summary.operationalTextureSource || '',
        )
          ? 'dato operativo confirmado del lote'
          : 'selección operativa del motor edáfico',
        0,
        30,
        ['laboratory', 'sensor'].includes(
          summary.operationalTextureSource || '',
        )
          ? 'medium'
          : undefined,
        ['laboratory', 'sensor'].includes(
          summary.operationalTextureSource || '',
        )
          ? 'observed'
          : 'estimated',
      ),
      canonicalTexture: estimated(
        summary.estimatedTexture,
        'clase',
        textureSource,
        textureSource === 'soilgrids'
          ? 'fracciones SoilGrids, clasificación USDA y reducción Chaman-7'
          : 'atributo textural INTA normalizado a Chaman-7',
      ),
      sandPercentage: estimated(summary.sandPercentage, '%'),
      siltPercentage: estimated(summary.siltPercentage, '%'),
      clayPercentage: estimated(summary.clayPercentage, '%'),
      drainageClass: estimated(
        summary.drainageClass,
        'clase',
        drainageUnit?.source || 'unknown',
        drainageUnit
          ? 'atributo de drenaje de unidad cartográfica INTA'
          : 'sin fuente cartográfica de drenaje',
        0,
        30,
        drainageUnit ? 'medium' : 'unavailable',
      ),
      fieldCapacityPercentage: estimated(
        fieldCapacity,
        '% v/v',
        'soilgrids',
        'contenido de agua a 33 kPa ponderado por espesor',
        0,
        100,
      ),
      wiltingPointPercentage: estimated(
        wiltingPoint,
        '% v/v',
        'soilgrids',
        'contenido de agua a 1500 kPa ponderado por espesor',
        0,
        100,
      ),
      availableWaterMmPerMeter: estimated(
        summary.availableWaterMmPerMeter,
        'mm/m',
        'soilgrids',
        'agua a 33 kPa menos agua a 1500 kPa, ponderada por espesor',
        0,
        100,
      ),
      rootZoneAvailableWaterMm: estimated(
        summary.rootZoneAvailableWaterMm,
        'mm',
        'derived',
        'agua disponible por metro multiplicada por profundidad efectiva',
        0,
        summary.effectiveDepthCm || 100,
        confidenceForDepth(0, Math.min(summary.effectiveDepthCm || 100, 200)),
      ),
      effectiveDepthCm: estimated(
        summary.effectiveDepthCm,
        'cm',
        dominantUnit ? dominantUnit.source : 'derived',
        dominantUnit
          ? 'profundidad efectiva informada por unidad cartográfica INTA'
          : 'valor operativo de respaldo del motor',
        0,
        summary.effectiveDepthCm || 100,
        dominantUnit ? 'medium' : 'low',
      ),
      ph: estimated(summary.ph, 'pH', 'soilgrids', 'pH en agua', 0, 30),
      organicCarbonGKg: estimated(
        summary.organicCarbonGKg,
        'g/kg',
        'soilgrids',
        'carbono orgánico del suelo',
      ),
      organicMatterEstimatedPercentage: estimated(
        summary.organicMatterEstimatedPercentage,
        '%',
        'derived',
        'carbono orgánico multiplicado por factor de Van Bemmelen 1.724',
        0,
        30,
        confidenceForDepth(0, 30),
      ),
      cecCmolKg: estimated(
        summary.cecCmolKg,
        'cmol(c)/kg',
        'soilgrids',
        'capacidad de intercambio catiónico a pH 7',
      ),
      bulkDensityKgDm3: estimated(
        summary.bulkDensityKgDm3,
        'kg/dm3',
        'soilgrids',
        'densidad aparente ponderada 0-30 cm',
      ),
      coarseFragmentsPercentage: estimated(
        summary.coarseFragmentsPercentage,
        'vol%',
        'soilgrids',
        'fragmentos gruesos ponderados 0-30 cm',
      ),
      phosphorusAvailable: summary.phosphorusAvailable as any,
    };
  }

  private async discardedResult(
    input: {
      lot: any;
      geometry: ReturnType<LotGeometryNormalizer['normalize']>;
      resolutionKey: string;
      reason: TMotivoInteligenciaSuelo;
    },
    phase: 'processing' | 'completion',
  ): Promise<IInteligenciaSueloLote> {
    this.logger.warn(
      JSON.stringify({
        event: 'soil_intelligence_discarded',
        loteId: `${input.lot._id}`,
        resolutionKey: input.resolutionKey,
        phase,
      }),
    );
    const current = await this.repository.getByLot(`${input.lot._id}`);
    if (current) return current;
    throw new Error('La evaluacion de suelo fue reemplazada por una nueva');
  }

  private async isCurrentResolution(input: {
    lot: any;
    geometry: ReturnType<LotGeometryNormalizer['normalize']>;
    resolutionKey: string;
    reason: TMotivoInteligenciaSuelo;
  }): Promise<boolean> {
    const lot = await this.lots.findById(`${input.lot._id}`).lean();
    if (!lot) return false;
    try {
      const geometry = this.geometryNormalizer.normalize(lot.ubicacion);
      return (
        this.resolutionKey(`${lot._id}`, geometry.geometryHash, lot) ===
        input.resolutionKey
      );
    } catch {
      return false;
    }
  }

  private resolutionKey(
    loteId: string,
    geometryHash: string,
    lot: any,
  ): string {
    return createHash('sha256')
      .update(
        [
          loteId,
          geometryHash,
          this.manualSoilFingerprint(lot),
          SOIL_INTELLIGENCE_ENGINE_VERSION,
          TEXTURE_MAPPING_VERSION,
          INTA_LAYER_REGISTRY_VERSION,
          SOILGRIDS_SOURCE_VERSION,
        ].join(':'),
      )
      .digest('hex');
  }

  private manualSoilFingerprint(lot: any): string {
    const fields = {
      suelos: this.soilLayersForFingerprint(lot.suelos),
      capacidadDeCampo: lot.capacidadDeCampo,
      puntoMarchitez: lot.puntoMarchitez,
      sueloReferencia: lot.sueloReferencia,
      texturaLixiviacion: lot.texturaLixiviacion,
      texturaEscorrentia: lot.texturaEscorrentia,
    };
    const hasValues = Object.values(fields).some((value) =>
      Array.isArray(value)
        ? value.length > 0
        : value !== undefined && value !== null && value !== '',
    );
    const manualSource = ['manual', 'laboratory', 'sensor'].includes(
      lot.sueloProcedencia,
    );
    const isManual =
      lot.sueloConfirmadoPorUsuario === true ||
      manualSource ||
      (!lot.sueloProcedencia && hasValues);
    if (!isManual) return 'automatic-soil';

    return createHash('sha256')
      .update(
        JSON.stringify(
          this.stableValue({
            source: lot.sueloProcedencia || 'legacy-manual',
            confirmed: lot.sueloConfirmadoPorUsuario,
            confirmedAt: lot.sueloFechaConfirmacion,
            fields,
          }),
        ),
      )
      .digest('hex');
  }

  private soilLayersForFingerprint(layers: any[] | undefined): unknown[] {
    return (layers || [])
      .map((layer) => ({
        profundidad: layer?.profundidad,
        textura: layer?.textura,
        capacidadDeCampo: layer?.capacidadDeCampo,
        puntoMarchitez: layer?.puntoMarchitez,
      }))
      .filter((layer) =>
        Object.values(layer).some(
          (value) => value !== undefined && value !== null && value !== '',
        ),
      );
  }

  private stableValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => this.stableValue(entry));
    }
    if (value instanceof Date) return value.toISOString();
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, this.stableValue(entry)]),
      );
    }
    return value;
  }

  private round(value: number, digits = 2): number {
    return Number(value.toFixed(digits));
  }
}
