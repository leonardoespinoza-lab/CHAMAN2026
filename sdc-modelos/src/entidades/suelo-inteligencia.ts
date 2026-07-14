import { TTexturaSuelo } from "./lote";

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

export interface IEntradasAgronomicasSuelo {
  loteId: string;
  operationalTexture?: TTexturaSuelo;
  estimatedTexture?: TTexturaSuelo;
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
