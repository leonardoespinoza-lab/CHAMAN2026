import type { ILote, ISuelo, TTexturaSuelo } from "./lote";

export type TEstadoInteligenciaSuelo =
  | "missing_geometry"
  | "pending"
  | "processing"
  | "ready"
  | "partial"
  | "no_coverage"
  | "invalid_geometry"
  | "source_unavailable"
  | "failed";

export type TFuentePropiedadSuelo =
  | "manual"
  | "laboratory"
  | "sensor"
  | "inta_local"
  | "inta_national"
  | "sisinta"
  | "soilgrids"
  | "derived"
  | "unknown";

export type TFuenteResumenSuelo =
  | "manual"
  | "laboratory"
  | "inta"
  | "soilgrids"
  | "mixed"
  | "derived"
  | "unknown";

export type TConfianzaInteligenciaSuelo =
  | "high"
  | "medium"
  | "low"
  | "unavailable";

export type TClaseDrenajeSuelo =
  | "excessive"
  | "somewhat_excessive"
  | "well"
  | "moderately_well"
  | "imperfect"
  | "poor"
  | "very_poor"
  | "unknown";

export type TClaseTexturalUsda =
  | "clay"
  | "silty clay"
  | "sandy clay"
  | "clay loam"
  | "silty clay loam"
  | "sandy clay loam"
  | "loam"
  | "silt loam"
  | "silt"
  | "sandy loam"
  | "loamy sand"
  | "sand";

export type TMotivoInteligenciaSuelo =
  | "lot_created"
  | "geometry_added"
  | "geometry_changed"
  | "lot_split"
  | "lot_merged"
  | "manual_value_changed"
  | "laboratory_changed"
  | "source_version_changed"
  | "engine_version_changed"
  | "partial_retry"
  | "failed_retry"
  | "backfill"
  | "lazy_read"
  | "manual_retry";

export interface IPropiedadSuelo<T = number> {
  value?: T | null;
  unit?: string;
  source: TFuentePropiedadSuelo;
  method?: string;
  depthFromCm?: number;
  depthToCm?: number;
  observedOrEstimated: "observed" | "estimated" | "reference" | "unknown";
  confidence: TConfianzaInteligenciaSuelo;
  uncertainty?: {
    q05?: number;
    q95?: number;
    ratio?: number;
    spatialLow?: number;
    spatialHigh?: number;
    spatialStandardDeviation?: number;
  };
  sourceDate?: string;
  sourceVersion?: string;
}

export interface IPerfilProfundidadSuelo {
  depthFromCm: number;
  depthToCm: number;
  sandQ05?: number;
  sandQ50?: number;
  sandQ95?: number;
  siltQ05?: number;
  siltQ50?: number;
  siltQ95?: number;
  clayQ05?: number;
  clayQ50?: number;
  clayQ95?: number;
  textureCompositionOriginalSum?: number;
  textureCompositionClosureApplied?: boolean;
  usdaTexture?: TClaseTexturalUsda;
  chamanTexture?: TTexturaSuelo;
  bulkDensityKgDm3?: number;
  coarseFragmentsPercentage?: number;
  phWater?: number;
  organicCarbonGKg?: number;
  organicMatterEstimatedPercentage?: number;
  cecCmolKg?: number;
  totalNitrogenGKg?: number;
  fieldCapacityPercentage?: number;
  wiltingPointPercentage?: number;
  availableWaterMmPerMeter?: number;
  validPixels?: number;
  coveragePercentage?: number;
  spatialLow?: number;
  spatialHigh?: number;
  spatialStandardDeviation?: number;
  source: TFuentePropiedadSuelo;
  confidence: TConfianzaInteligenciaSuelo;
  qualityFlags?: string[];
}

export interface IUnidadSueloLote {
  source: TFuentePropiedadSuelo;
  sourceFeatureId?: string;
  layerId?: string;
  unitSymbol?: string;
  unitName?: string;
  seriesName?: string;
  taxonomy?: {
    order?: string;
    suborder?: string;
    greatGroup?: string;
    subgroup?: string;
  };
  originalTexture?: string;
  originalTextureSystem?: string;
  canonicalTexture?: TTexturaSuelo;
  drainageOriginal?: string;
  drainageClass?: TClaseDrenajeSuelo;
  capabilityClass?: string;
  limitations?: string[];
  rawAttributes?: Record<string, unknown>;
  areaHectares?: number;
  areaPercentage?: number;
  sourceScale?: string;
  sourceVersion?: string;
}

export interface IFuenteSueloMetadata {
  type: TFuenteResumenSuelo;
  provider?: string;
  dataset?: string;
  layerId?: string;
  resolutionMeters?: number;
  scale?: string;
  coveragePercentage?: number;
  confidence: TConfianzaInteligenciaSuelo;
  confidenceScore?: number;
  confidenceFactors?: string[];
  sourceDate?: string;
  sourceVersion?: string;
  calculatedAt?: string;
  license?: string;
  attribution?: string;
  metadataUrl?: string;
}

export interface IResumenInteligenciaSuelo {
  operationalTexture?: TTexturaSuelo;
  operationalTextureSource?: TFuentePropiedadSuelo;
  estimatedTexture?: TTexturaSuelo;
  canonicalTexture?: TTexturaSuelo;
  usdaTexture?: TClaseTexturalUsda;
  originalTexture?: string;
  originalTextureSystem?: string;
  depthFromCm: number;
  depthToCm: number;
  sandPercentage?: number;
  siltPercentage?: number;
  clayPercentage?: number;
  drainageClass?: TClaseDrenajeSuelo;
  availableWaterMmPerMeter?: number;
  rootZoneAvailableWaterMm?: number;
  effectiveDepthCm?: number;
  ph?: number;
  organicCarbonGKg?: number;
  organicMatterEstimatedPercentage?: number;
  cecCmolKg?: number;
  bulkDensityKgDm3?: number;
  coarseFragmentsPercentage?: number;
  phosphorusAvailable?: IPropiedadSuelo<number>;
}

export interface ITaxonomiaSueloLote {
  intaUnit?: string;
  series?: string;
  order?: string;
  suborder?: string;
  greatGroup?: string;
  subgroup?: string;
  capabilityClass?: string;
}

export interface IInteligenciaSueloLote {
  _id?: string;
  loteId: string;
  status: TEstadoInteligenciaSuelo;
  geometryHash?: string;
  resolutionKey?: string;
  summary?: IResumenInteligenciaSuelo;
  taxonomy?: ITaxonomiaSueloLote;
  source?: IFuenteSueloMetadata;
  sources?: IFuenteSueloMetadata[];
  depthProfile?: IPerfilProfundidadSuelo[];
  soilUnits?: IUnidadSueloLote[];
  propertyProvenance?: Record<string, IPropiedadSuelo<unknown>>;
  coveragePercentage?: number;
  heterogeneityFlag?: boolean;
  manualConflict?: boolean;
  engineVersion?: string;
  mappingVersion?: string;
  sourceVersions?: Record<string, string>;
  warnings?: string[];
  qualityFlags?: string[];
  reason?: TMotivoInteligenciaSuelo;
  attempts?: number;
  requestedAt?: string;
  processingStartedAt?: string;
  calculatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const SOIL_AGRONOMIC_SELECTION_POLICY_VERSION =
  "soil-agronomic-selection-v1.0.0";

export type TRazonSeleccionAgronomicaSuelo =
  | "confirmed_laboratory"
  | "confirmed_sensor"
  | "automatic_assessment"
  | "manual_fallback"
  | "legacy_fallback"
  | "unavailable";

export interface ICapaEntradasAgronomicasSuelo {
  depthFromCm: number;
  depthToCm: number;
  texture?: TTexturaSuelo;
  fieldCapacityPercentage?: number;
  wiltingPointPercentage?: number;
  availableWaterMmPerMeter?: number;
  source: TFuentePropiedadSuelo;
  confidence: TConfianzaInteligenciaSuelo;
}

export interface IAlternativaEntradasAgronomicasSuelo {
  source: TFuentePropiedadSuelo;
  confirmed: boolean;
  reason: string;
  operationalTexture?: TTexturaSuelo;
  fieldCapacityPercentage?: number;
  wiltingPointPercentage?: number;
  depthLayers?: ICapaEntradasAgronomicasSuelo[];
}

export interface IEntradasAgronomicasSuelo {
  loteId: string;
  status: TEstadoInteligenciaSuelo;
  stale: boolean;
  calculatedAt?: string;
  resolutionKey?: string;
  selectionPolicyVersion: string;
  selectionReason: TRazonSeleccionAgronomicaSuelo;
  operationalTexture?: TTexturaSuelo;
  estimatedTexture?: TTexturaSuelo;
  fieldCapacityPercentage?: number;
  wiltingPointPercentage?: number;
  depthLayers: ICapaEntradasAgronomicasSuelo[];
  provenance: Record<string, IPropiedadSuelo<unknown>>;
  alternatives?: IAlternativaEntradasAgronomicasSuelo[];
  conflicts?: string[];
  sandPercentage?: number;
  siltPercentage?: number;
  clayPercentage?: number;
  drainageClass?: TClaseDrenajeSuelo;
  availableWaterMmPerMeter?: number;
  rootZoneAvailableWaterMm?: number;
  effectiveDepthCm?: number;
  bulkDensityKgDm3?: number;
  coarseFragmentsPercentage?: number;
  ph?: number;
  organicCarbonGKg?: number;
  source?: TFuenteResumenSuelo;
  confidence?: TConfianzaInteligenciaSuelo;
  warnings?: string[];
}

/**
 * Proyecta una seleccion edafica vigente sobre una copia del lote. La funcion
 * no decide precedencia y nunca modifica el objeto recibido.
 */
function capacidadCampoCanonica(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 100
    ? parsed
    : undefined;
}

function puntoMarchitezCanonico(
  value: unknown,
  fieldCapacity?: number,
): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return undefined;
  return fieldCapacity === undefined || parsed < fieldCapacity
    ? parsed
    : undefined;
}

export function aplicarEntradasAgronomicasSuelo<T extends ILote>(
  lote: T,
  inputs?: IEntradasAgronomicasSuelo | null,
): T {
  const cloned = {
    ...lote,
    suelos: lote.suelos?.map((layer) => ({ ...layer })),
  } as T;
  const usableStatus: TEstadoInteligenciaSuelo[] = [
    "ready",
    "partial",
    "no_coverage",
  ];
  if (!inputs || inputs.stale || !usableStatus.includes(inputs.status)) {
    return cloned;
  }

  if (inputs.operationalTexture) {
    cloned.texturaLixiviacion = inputs.operationalTexture;
    cloned.texturaEscorrentia = inputs.operationalTexture;
  }
  const fieldCapacity =
    capacidadCampoCanonica(inputs.fieldCapacityPercentage) ??
    capacidadCampoCanonica(lote.capacidadDeCampo);
  const wiltingPoint =
    puntoMarchitezCanonico(inputs.wiltingPointPercentage, fieldCapacity) ??
    puntoMarchitezCanonico(lote.puntoMarchitez, fieldCapacity);
  cloned.capacidadDeCampo = fieldCapacity;
  cloned.puntoMarchitez = wiltingPoint;
  if (inputs.depthLayers.length) {
    const existing = lote.suelos || [];
    const hasSensorLayout = existing.some((layer) => {
      const sensorNumber = Number(layer.numeroDeSensor);
      return Number.isInteger(sensorNumber) && sensorNumber > 0;
    });
    if (hasSensorLayout) {
      cloned.suelos = existing.map((current, index): ISuelo => {
        const depth = Number(current.profundidad);
        const containing = Number.isFinite(depth)
          ? inputs.depthLayers.find(
              (layer) => depth > layer.depthFromCm && depth <= layer.depthToCm,
            )
          : undefined;
        const nearest = Number.isFinite(depth)
          ? [...inputs.depthLayers].sort((left, right) => {
              const distance = (layer: ICapaEntradasAgronomicasSuelo) =>
                depth < layer.depthFromCm
                  ? layer.depthFromCm - depth
                  : depth > layer.depthToCm
                    ? depth - layer.depthToCm
                    : 0;
              return distance(left) - distance(right);
            })[0]
          : inputs.depthLayers[index] || inputs.depthLayers[0];
        const selected = containing || nearest;
        const selectedFieldCapacity =
          capacidadCampoCanonica(selected?.fieldCapacityPercentage) ??
          capacidadCampoCanonica(current.capacidadDeCampo);
        const selectedWiltingPoint =
          puntoMarchitezCanonico(
            selected?.wiltingPointPercentage,
            selectedFieldCapacity,
          ) ??
          puntoMarchitezCanonico(current.puntoMarchitez, selectedFieldCapacity);
        return {
          ...current,
          textura:
            selected?.texture || inputs.operationalTexture || current.textura,
          capacidadDeCampo: selectedFieldCapacity,
          puntoMarchitez: selectedWiltingPoint,
        };
      });
    } else {
      const existingByDepth = existing
        .filter((layer) => Number.isFinite(Number(layer.profundidad)))
        .sort(
          (left, right) => Number(left.profundidad) - Number(right.profundidad),
        );
      cloned.suelos = inputs.depthLayers.map((layer, index): ISuelo => {
        const layerFieldCapacity = capacidadCampoCanonica(
          layer.fieldCapacityPercentage,
        );
        const layerWiltingPoint = puntoMarchitezCanonico(
          layer.wiltingPointPercentage,
          layerFieldCapacity,
        );
        const rootSource =
          existingByDepth.find(
            (current) => layer.depthToCm <= Number(current.profundidad),
          ) ||
          existing[index] ||
          existing[existing.length - 1];
        return {
          profundidad: layer.depthToCm,
          textura: layer.texture || inputs.operationalTexture,
          capacidadDeCampo: layerFieldCapacity,
          puntoMarchitez: layerWiltingPoint,
          ...(rootSource &&
          Object.prototype.hasOwnProperty.call(rootSource, "hayRaices")
            ? { hayRaices: rootSource.hayRaices }
            : {}),
        };
      });
    }
  }
  return cloned;
}
