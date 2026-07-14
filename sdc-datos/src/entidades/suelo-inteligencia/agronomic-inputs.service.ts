import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  IAlternativaEntradasAgronomicasSuelo,
  ICapaEntradasAgronomicasSuelo,
  IEntradasAgronomicasSuelo,
  IInteligenciaSueloLote,
  IPropiedadSuelo,
  SOIL_AGRONOMIC_SELECTION_POLICY_VERSION,
  TConfianzaInteligenciaSuelo,
  TFuentePropiedadSuelo,
  TFuenteResumenSuelo,
  TRazonSeleccionAgronomicaSuelo,
  TTexturaSuelo,
} from 'modelos/src';
import { Model } from 'mongoose';
import { Lote, LoteDocument } from '../lote/modelos/schema';
import { LotSoilIntelligenceEngine } from './engine.service';

interface SoilCandidate {
  source: TFuentePropiedadSuelo;
  confidence: TConfianzaInteligenciaSuelo;
  reason: TRazonSeleccionAgronomicaSuelo;
  operationalTexture?: TTexturaSuelo;
  fieldCapacityPercentage?: number;
  wiltingPointPercentage?: number;
  depthLayers: ICapaEntradasAgronomicasSuelo[];
  provenance: Record<string, IPropiedadSuelo<unknown>>;
}

@Injectable()
export class SoilAgronomicInputsService {
  constructor(
    @InjectModel(Lote.name) private readonly lots: Model<LoteDocument>,
    private readonly engine: LotSoilIntelligenceEngine,
  ) {}

  async getForLot(loteId: string): Promise<IEntradasAgronomicasSuelo | null> {
    const lot = await this.lots.findById(loteId).lean();
    if (!lot) throw new NotFoundException('Lote no encontrado');

    // engine.get valida geometryHash, versiones y huella manual. Leer el
    // repository directamente permitiria servir un summary viejo.
    const assessment = await this.engine.get(loteId);
    if (!assessment) return null;

    const terminal = ['ready', 'partial', 'no_coverage'].includes(
      assessment.status,
    );
    const stale = !terminal;
    const legacy = this.lotCandidate(lot);
    const automatic = terminal
      ? this.automaticCandidate(assessment)
      : undefined;
    const explicitConfirmed = this.hasExplicitConfirmedEvidence(lot);

    let selected: SoilCandidate | undefined;
    if (explicitConfirmed && legacy) {
      selected = this.overlayCandidate(
        {
          ...legacy,
          reason:
            lot.sueloProcedencia === 'laboratory'
              ? 'confirmed_laboratory'
              : 'confirmed_sensor',
        },
        automatic,
      );
    } else if (automatic) {
      selected = automatic;
    } else if (legacy) {
      selected = {
        ...legacy,
        reason:
          lot.sueloProcedencia === 'manual'
            ? 'manual_fallback'
            : 'legacy_fallback',
      };
    }

    const alternatives: IAlternativaEntradasAgronomicasSuelo[] = [];
    if (selected === automatic && legacy && this.isManualOrLegacy(lot)) {
      alternatives.push(
        this.alternative(legacy, lot, 'Dato conservado del lote'),
      );
    }
    if (selected !== automatic && automatic) {
      alternatives.push(
        this.alternative(
          automatic,
          undefined,
          'Evaluacion automatica vigente no seleccionada por precedencia',
        ),
      );
    }
    const conflicts = this.conflicts(selected, alternatives);
    const summary = automatic ? assessment.summary : undefined;
    const availableWaterMmPerMeter =
      this.weighted(
        selected?.depthLayers || [],
        'availableWaterMmPerMeter',
        0,
        100,
      ) ??
      this.availableWater(
        selected?.fieldCapacityPercentage,
        selected?.wiltingPointPercentage,
      );
    const selectedDepthCm = selected?.depthLayers.length
      ? Math.max(...selected.depthLayers.map((layer) => layer.depthToCm))
      : undefined;
    const rootZoneAvailableWaterMm =
      selected === automatic
        ? this.nonNegative(summary?.rootZoneAvailableWaterMm)
        : Number.isFinite(availableWaterMmPerMeter) &&
            Number.isFinite(selectedDepthCm)
          ? Number(
              (availableWaterMmPerMeter! * (selectedDepthCm! / 100)).toFixed(2),
            )
          : undefined;

    return {
      loteId,
      status: assessment.status,
      stale,
      calculatedAt: terminal ? assessment.calculatedAt : undefined,
      resolutionKey: assessment.resolutionKey,
      selectionPolicyVersion: SOIL_AGRONOMIC_SELECTION_POLICY_VERSION,
      selectionReason: selected?.reason || 'unavailable',
      operationalTexture: selected?.operationalTexture,
      estimatedTexture: summary?.estimatedTexture,
      fieldCapacityPercentage: selected?.fieldCapacityPercentage,
      wiltingPointPercentage: selected?.wiltingPointPercentage,
      depthLayers: selected?.depthLayers || [],
      provenance: selected?.provenance || {},
      alternatives: alternatives.length ? alternatives : undefined,
      conflicts: conflicts.length ? conflicts : undefined,
      sandPercentage: summary?.sandPercentage,
      siltPercentage: summary?.siltPercentage,
      clayPercentage: summary?.clayPercentage,
      drainageClass: summary?.drainageClass,
      availableWaterMmPerMeter,
      rootZoneAvailableWaterMm,
      effectiveDepthCm:
        selected === automatic ? summary?.effectiveDepthCm : selectedDepthCm,
      bulkDensityKgDm3: summary?.bulkDensityKgDm3,
      coarseFragmentsPercentage: summary?.coarseFragmentsPercentage,
      ph: summary?.ph,
      organicCarbonGKg: summary?.organicCarbonGKg,
      source: this.summarySource(selected, assessment),
      confidence: selected?.confidence,
      warnings: assessment.warnings,
    };
  }

  private automaticCandidate(
    assessment: IInteligenciaSueloLote,
  ): SoilCandidate | undefined {
    const summary = assessment.summary;
    const hasAutomaticEvidence =
      assessment.sources?.some((source) =>
        ['inta', 'soilgrids', 'mixed'].includes(source.type),
      ) ||
      assessment.depthProfile?.some((layer) =>
        ['soilgrids', 'inta_local', 'inta_national'].includes(layer.source),
      );
    if (!summary || !hasAutomaticEvidence) return undefined;

    const automaticTexture =
      summary.canonicalTexture || summary.estimatedTexture;

    const depthLayers = (assessment.depthProfile || []).map((layer) => {
      const fieldCapacityPercentage = this.fieldCapacity(
        layer.fieldCapacityPercentage,
      );
      const wiltingPointPercentage = this.wiltingPoint(
        fieldCapacityPercentage,
        layer.wiltingPointPercentage,
      );
      return {
        depthFromCm: layer.depthFromCm,
        depthToCm: layer.depthToCm,
        texture: layer.chamanTexture,
        fieldCapacityPercentage,
        wiltingPointPercentage,
        availableWaterMmPerMeter: this.nonNegative(
          layer.availableWaterMmPerMeter,
          this.availableWater(fieldCapacityPercentage, wiltingPointPercentage),
        ),
        source: layer.source,
        confidence: layer.confidence,
      } as ICapaEntradasAgronomicasSuelo;
    });
    const confidence = assessment.source?.confidence || 'unavailable';
    const textureProvenance = assessment.propertyProvenance?.canonicalTexture;
    const fieldCapacity = this.fieldCapacity(
      this.weighted(depthLayers, 'fieldCapacityPercentage', 0, 100),
    );
    const wiltingPoint = this.wiltingPoint(
      fieldCapacity,
      this.weighted(depthLayers, 'wiltingPointPercentage', 0, 100),
    );
    const profileConfidence = this.profileConfidence(depthLayers, 0, 100);
    const provenance = {
      ...(assessment.propertyProvenance || {}),
      operationalTexture: this.property(
        automaticTexture,
        'clase',
        textureProvenance?.source || 'soilgrids',
        textureProvenance?.method || 'clasificacion edafica automatica',
        0,
        30,
        textureProvenance?.confidence || confidence,
      ),
      fieldCapacityPercentage: this.property(
        fieldCapacity,
        '% v/v',
        'soilgrids',
        'contenido de agua a 33 kPa ponderado por espesor',
        0,
        100,
        profileConfidence,
      ),
      wiltingPointPercentage: this.property(
        wiltingPoint,
        '% v/v',
        'soilgrids',
        'contenido de agua a 1500 kPa ponderado por espesor',
        0,
        100,
        profileConfidence,
      ),
      availableWaterMmPerMeter: this.property(
        this.weighted(depthLayers, 'availableWaterMmPerMeter', 0, 100),
        'mm/m',
        'soilgrids',
        'diferencia entre agua a 33 kPa y 1500 kPa ponderada 0-100 cm',
        0,
        100,
        profileConfidence,
      ),
    };
    return {
      source: textureProvenance?.source || 'soilgrids',
      confidence,
      reason: 'automatic_assessment',
      operationalTexture: automaticTexture,
      fieldCapacityPercentage: fieldCapacity,
      wiltingPointPercentage: wiltingPoint,
      depthLayers,
      provenance,
    };
  }

  private lotCandidate(lot: any): SoilCandidate | undefined {
    const validLaboratory =
      lot.sueloProcedencia !== 'laboratory' ||
      this.hasValidLaboratoryEvidence(lot);
    const source: TFuentePropiedadSuelo = validLaboratory
      ? lot.sueloProcedencia || 'unknown'
      : 'unknown';
    const explicitlyConfirmed = this.hasExplicitConfirmedEvidence(lot);
    const confidence: TConfianzaInteligenciaSuelo = explicitlyConfirmed
      ? 'medium'
      : source === 'manual'
        ? 'low'
        : 'unavailable';
    const depthLayers = this.legacyLayers(lot, source, confidence);
    const operationalTexture =
      depthLayers.find((layer) => !!layer.texture)?.texture ||
      lot.texturaEscorrentia ||
      lot.texturaLixiviacion;
    const fieldCapacityPercentage = this.fieldCapacity(
      lot.capacidadDeCampo,
      depthLayers[0]?.fieldCapacityPercentage,
    );
    const wiltingPointPercentage = this.wiltingPoint(
      fieldCapacityPercentage,
      lot.puntoMarchitez,
      depthLayers[0]?.wiltingPointPercentage,
    );
    if (
      !operationalTexture &&
      !Number.isFinite(fieldCapacityPercentage) &&
      !Number.isFinite(wiltingPointPercentage) &&
      !depthLayers.length
    ) {
      return undefined;
    }
    const observed = explicitlyConfirmed;
    const raw = lot.sueloReferencia?.raw || {};
    const method =
      source === 'laboratory' && observed
        ? `${raw.method || raw.metodo || raw.metodoAnalitico}; informe ${raw.laboratoryReportId || raw.reportId || raw.informeLaboratorioId}`
        : source === 'sensor' && observed
          ? 'valor confirmado de sensor calibrado'
          : 'dato operativo legado del lote';
    const provenance: Record<string, IPropiedadSuelo<unknown>> = {
      operationalTexture: this.property(
        operationalTexture,
        'clase',
        source,
        method,
        0,
        depthLayers[0]?.depthToCm || 30,
        confidence,
        observed ? 'observed' : 'reference',
      ),
      fieldCapacityPercentage: this.property(
        fieldCapacityPercentage,
        '% v/v',
        source,
        method,
        0,
        100,
        confidence,
        observed ? 'observed' : 'reference',
      ),
      wiltingPointPercentage: this.property(
        wiltingPointPercentage,
        '% v/v',
        source,
        method,
        0,
        100,
        confidence,
        observed ? 'observed' : 'reference',
      ),
      availableWaterMmPerMeter: this.property(
        this.availableWater(fieldCapacityPercentage, wiltingPointPercentage),
        'mm/m',
        'derived',
        'diferencia CC-PMP sobre valores legacy expresados como % v/v',
        0,
        100,
        confidence,
        'estimated',
      ),
    };
    return {
      source,
      confidence,
      reason: 'legacy_fallback',
      operationalTexture,
      fieldCapacityPercentage,
      wiltingPointPercentage,
      depthLayers,
      provenance,
    };
  }

  private legacyLayers(
    lot: any,
    source: TFuentePropiedadSuelo,
    confidence: TConfianzaInteligenciaSuelo,
  ): ICapaEntradasAgronomicasSuelo[] {
    const layers = [...(lot.suelos || [])].sort(
      (left, right) =>
        Number(left.profundidad || Infinity) -
        Number(right.profundidad || Infinity),
    );
    if (!layers.length) {
      const fieldCapacityPercentage = this.fieldCapacity(lot.capacidadDeCampo);
      const wiltingPointPercentage = this.wiltingPoint(
        fieldCapacityPercentage,
        lot.puntoMarchitez,
      );
      const texture = lot.texturaEscorrentia || lot.texturaLixiviacion;
      return texture ||
        Number.isFinite(fieldCapacityPercentage) ||
        Number.isFinite(wiltingPointPercentage)
        ? [
            {
              depthFromCm: 0,
              depthToCm: 30,
              texture,
              fieldCapacityPercentage,
              wiltingPointPercentage,
              availableWaterMmPerMeter: this.availableWater(
                fieldCapacityPercentage,
                wiltingPointPercentage,
              ),
              source,
              confidence,
            },
          ]
        : [];
    }
    let fromCm = 0;
    return layers.map((layer, index) => {
      const requestedDepth = Number(layer.profundidad);
      const depthToCm =
        Number.isFinite(requestedDepth) && requestedDepth > fromCm
          ? requestedDepth
          : fromCm + (index === 0 ? 30 : 20);
      const fieldCapacityPercentage = this.fieldCapacity(
        layer.capacidadDeCampo,
        index === 0 ? lot.capacidadDeCampo : undefined,
      );
      const wiltingPointPercentage = this.wiltingPoint(
        fieldCapacityPercentage,
        layer.puntoMarchitez,
        index === 0 ? lot.puntoMarchitez : undefined,
      );
      const result: ICapaEntradasAgronomicasSuelo = {
        depthFromCm: fromCm,
        depthToCm,
        texture: layer.textura,
        fieldCapacityPercentage,
        wiltingPointPercentage,
        availableWaterMmPerMeter: this.availableWater(
          fieldCapacityPercentage,
          wiltingPointPercentage,
        ),
        source,
        confidence,
      };
      fromCm = depthToCm;
      return result;
    });
  }

  private alternative(
    candidate: SoilCandidate,
    lot: any | undefined,
    reason: string,
  ): IAlternativaEntradasAgronomicasSuelo {
    return {
      source: candidate.source,
      confirmed: lot
        ? lot.sueloProcedencia === 'laboratory' ||
          lot.sueloProcedencia === 'sensor'
          ? this.hasExplicitConfirmedEvidence(lot)
          : lot.sueloConfirmadoPorUsuario === true
        : false,
      reason,
      operationalTexture: candidate.operationalTexture,
      fieldCapacityPercentage: candidate.fieldCapacityPercentage,
      wiltingPointPercentage: candidate.wiltingPointPercentage,
      depthLayers: candidate.depthLayers,
    };
  }

  private overlayCandidate(
    primary: SoilCandidate,
    fallback?: SoilCandidate,
  ): SoilCandidate {
    if (!fallback) return primary;
    const fieldCapacityPercentage = this.fieldCapacity(
      primary.fieldCapacityPercentage,
      fallback.fieldCapacityPercentage,
    );
    const wiltingPointPercentage = this.wiltingPoint(
      fieldCapacityPercentage,
      primary.wiltingPointPercentage,
      fallback.wiltingPointPercentage,
    );
    const primaryProvenance = Object.fromEntries(
      Object.entries(primary.provenance).filter(
        ([, property]) =>
          property.value !== undefined && property.value !== null,
      ),
    );
    return {
      ...primary,
      operationalTexture:
        primary.operationalTexture || fallback.operationalTexture,
      fieldCapacityPercentage,
      wiltingPointPercentage,
      depthLayers: primary.depthLayers.length
        ? primary.depthLayers
        : fallback.depthLayers,
      provenance: {
        ...fallback.provenance,
        ...primaryProvenance,
      },
    };
  }

  private conflicts(
    selected: SoilCandidate | undefined,
    alternatives: IAlternativaEntradasAgronomicasSuelo[],
  ): string[] {
    if (!selected) return [];
    const conflicts: string[] = [];
    for (const alternative of alternatives) {
      if (
        selected.operationalTexture &&
        alternative.operationalTexture &&
        selected.operationalTexture !== alternative.operationalTexture
      ) {
        conflicts.push(
          `Textura seleccionada ${selected.operationalTexture}; alternativa ${alternative.operationalTexture} (${alternative.source}).`,
        );
      }
      for (const [label, selectedValue, alternativeValue] of [
        [
          'Capacidad de campo',
          selected.fieldCapacityPercentage,
          alternative.fieldCapacityPercentage,
        ],
        [
          'Punto de marchitez',
          selected.wiltingPointPercentage,
          alternative.wiltingPointPercentage,
        ],
      ] as const) {
        if (
          Number.isFinite(selectedValue) &&
          Number.isFinite(alternativeValue) &&
          Math.abs(selectedValue! - alternativeValue!) >= 0.5
        ) {
          conflicts.push(
            `${label} seleccionado ${selectedValue}%; alternativa ${alternativeValue}% (${alternative.source}).`,
          );
        }
      }
    }
    return conflicts;
  }

  private property(
    value: unknown,
    unit: string,
    source: TFuentePropiedadSuelo,
    method: string,
    depthFromCm: number,
    depthToCm: number,
    confidence: TConfianzaInteligenciaSuelo,
    observedOrEstimated: IPropiedadSuelo['observedOrEstimated'] = 'estimated',
  ): IPropiedadSuelo<unknown> {
    return {
      value,
      unit,
      source,
      method,
      depthFromCm,
      depthToCm,
      observedOrEstimated:
        value === undefined ? 'unknown' : observedOrEstimated,
      confidence: value === undefined ? 'unavailable' : confidence,
    };
  }

  private weighted(
    layers: ICapaEntradasAgronomicasSuelo[],
    key:
      | 'fieldCapacityPercentage'
      | 'wiltingPointPercentage'
      | 'availableWaterMmPerMeter',
    fromCm: number,
    toCm: number,
  ): number | undefined {
    let weighted = 0;
    let depth = 0;
    for (const layer of layers) {
      const value = Number(layer[key]);
      const overlap = Math.max(
        0,
        Math.min(layer.depthToCm, toCm) - Math.max(layer.depthFromCm, fromCm),
      );
      if (!Number.isFinite(value) || overlap <= 0) continue;
      weighted += value * overlap;
      depth += overlap;
    }
    return depth ? Number((weighted / depth).toFixed(2)) : undefined;
  }

  private profileConfidence(
    layers: ICapaEntradasAgronomicasSuelo[],
    fromCm: number,
    toCm: number,
  ): TConfianzaInteligenciaSuelo {
    const rank: Record<TConfianzaInteligenciaSuelo, number> = {
      unavailable: 0,
      low: 1,
      medium: 2,
      high: 3,
    };
    const relevant = layers.filter(
      (layer) => layer.depthToCm > fromCm && layer.depthFromCm < toCm,
    );
    if (!relevant.length) return 'unavailable';
    return relevant.reduce(
      (lowest, layer) =>
        rank[layer.confidence] < rank[lowest] ? layer.confidence : lowest,
      relevant[0].confidence,
    );
  }

  private availableWater(
    fieldCapacity?: number,
    wiltingPoint?: number,
  ): number | undefined {
    return Number.isFinite(fieldCapacity) &&
      Number.isFinite(wiltingPoint) &&
      fieldCapacity! > wiltingPoint!
      ? Number(((fieldCapacity! - wiltingPoint!) * 10).toFixed(2))
      : undefined;
  }

  private fieldCapacity(...values: unknown[]): number | undefined {
    for (const value of values) {
      const parsed = this.finite(value);
      if (parsed !== undefined && parsed > 0 && parsed <= 100) return parsed;
    }
    return undefined;
  }

  private wiltingPoint(
    fieldCapacity: number | undefined,
    ...values: unknown[]
  ): number | undefined {
    for (const value of values) {
      const parsed = this.finite(value);
      if (
        parsed !== undefined &&
        parsed >= 0 &&
        parsed <= 100 &&
        (fieldCapacity === undefined || parsed < fieldCapacity)
      ) {
        return parsed;
      }
    }
    return undefined;
  }

  private nonNegative(...values: unknown[]): number | undefined {
    for (const value of values) {
      const parsed = this.finite(value);
      if (parsed !== undefined && parsed >= 0) return parsed;
    }
    return undefined;
  }

  private finite(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private isManualOrLegacy(lot: any): boolean {
    return (
      lot.sueloConfirmadoPorUsuario === true ||
      lot.sueloProcedencia === 'manual' ||
      !lot.sueloProcedencia
    );
  }

  private hasValidLaboratoryEvidence(lot: any): boolean {
    const raw = lot.sueloReferencia?.raw || {};
    const reportId =
      raw.laboratoryReportId || raw.reportId || raw.informeLaboratorioId;
    const method = raw.method || raw.metodo || raw.metodoAnalitico;
    const hasDepth = (lot.suelos || []).some(
      (layer) =>
        Number.isFinite(Number(layer.profundidad)) && layer.profundidad > 0,
    );
    return !!reportId && !!method && hasDepth;
  }

  private hasExplicitConfirmedEvidence(lot: any): boolean {
    return (
      lot.sueloConfirmadoPorUsuario === true &&
      (lot.sueloProcedencia === 'sensor' ||
        (lot.sueloProcedencia === 'laboratory' &&
          this.hasValidLaboratoryEvidence(lot)))
    );
  }

  private summarySource(
    selected: SoilCandidate | undefined,
    assessment: IInteligenciaSueloLote,
  ): TFuenteResumenSuelo | undefined {
    if (!selected) return undefined;
    if (selected.reason === 'automatic_assessment') {
      return assessment.source?.type;
    }
    if (selected.source === 'laboratory') return 'laboratory';
    if (selected.source === 'manual') return 'manual';
    return 'unknown';
  }
}
