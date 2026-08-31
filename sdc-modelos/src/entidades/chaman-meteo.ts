export type ChamanMeteoJobStatus =
  | "PENDING"
  | "DOWNLOADING"
  | "PARTIAL"
  | "AVAILABLE"
  | "FAILED";

export type ChamanMeteoJobType = "BACKFILL" | "INCREMENTAL" | "REPAIR";

export interface IChamanMeteoGridPoint {
  _id?: string;
  key: string;
  latitude: number;
  longitude: number;
  countryCode?: "AR" | "UY" | "PY" | "BR" | "CL";
  timezone?: string;
  enabled: boolean;
  provider: "copernicus-cds";
  dataset: "reanalysis-era5-land-timeseries";
  historicalStart: string;
  latestAvailable?: string;
  firstDataAt?: string;
  lastDataAt?: string;
  creadoEn?: string;
  actualizadoEn?: string;
}

export interface IChamanMeteoLocationBinding {
  _id?: string;
  locationType: "establecimiento" | "lote";
  locationId: string;
  gridPointKey: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  active: boolean;
  creadoEn?: string;
  actualizadoEn?: string;
}

/**
 * Binding operativo resuelto de forma atomica. El consumidor nunca elige el
 * punto mas cercano: usa exclusivamente el punto activo asociado al lote.
 */
export interface IChamanMeteoResolvedLocationBinding {
  binding: IChamanMeteoLocationBinding;
  gridPoint: IChamanMeteoGridPoint;
}

export interface IChamanMeteoRawValues {
  temperatureK?: number;
  dewPointK?: number;
  surfacePressurePa?: number;
  windU10Ms?: number;
  windV10Ms?: number;
  precipitationM?: number;
  shortwaveRadiationJm2?: number;
  thermalRadiationJm2?: number;
  skinTemperatureK?: number;
  snowCoverFraction?: number;
  snowDepthM?: number;
  soilTemperatureK?: Array<number | null>;
  soilWaterM3M3?: Array<number | null>;
}

export interface IChamanMeteoHourlyValues {
  temperatureC?: number;
  dewPointC?: number;
  relativeHumidityPct?: number;
  surfacePressureKpa?: number;
  windU10Ms?: number;
  windV10Ms?: number;
  windSpeed10Ms?: number;
  windSpeed2Ms?: number;
  windDirectionDeg?: number;
  precipitationMm?: number;
  shortwaveRadiationMjM2?: number;
  thermalRadiationMjM2?: number;
  netRadiationMjM2?: number;
  vpdKpa?: number;
  et0Mm?: number;
  skinTemperatureC?: number;
  snowCoverPct?: number;
  snowDepthM?: number;
  soilTemperatureC?: Array<number | null>;
  soilWaterM3M3?: Array<number | null>;
}

export interface IChamanMeteoDailyValues {
  temperatureMinC?: number;
  temperatureMeanC?: number;
  temperatureMaxC?: number;
  relativeHumidityMinPct?: number;
  relativeHumidityMeanPct?: number;
  relativeHumidityMaxPct?: number;
  dewPointMinC?: number;
  dewPointMeanC?: number;
  dewPointMaxC?: number;
  surfacePressureMinKpa?: number;
  surfacePressureMeanKpa?: number;
  surfacePressureMaxKpa?: number;
  precipitationMm?: number;
  precipitationMaxHourlyMm?: number;
  /** @deprecated Use windSpeed2mMeanMs. */
  windSpeedMeanMs?: number;
  /** @deprecated Use windSpeed2mMaxMs. */
  windSpeedMaxMs?: number;
  windSpeed2mMeanMs?: number;
  windSpeed2mMaxMs?: number;
  windSpeed10mMeanMs?: number;
  windSpeed10mMaxMs?: number;
  windDirectionDominantDeg?: number;
  windDirectionResultantRatio?: number;
  shortwaveRadiationMjM2?: number;
  thermalRadiationMjM2?: number;
  netRadiationMjM2?: number;
  et0Mm?: number;
  vpdMinKpa?: number;
  vpdMeanKpa?: number;
  vpdMaxKpa?: number;
  skinTemperatureMinC?: number;
  skinTemperatureMeanC?: number;
  skinTemperatureMaxC?: number;
  snowCoverMinPct?: number;
  snowCoverMeanPct?: number;
  snowCoverMaxPct?: number;
  snowDepthMinM?: number;
  snowDepthMeanM?: number;
  snowDepthMaxM?: number;
  soilTemperatureMinC?: Array<number | null>;
  soilTemperatureMeanC?: Array<number | null>;
  soilTemperatureMaxC?: Array<number | null>;
  soilWaterMinM3M3?: Array<number | null>;
  soilWaterMeanM3M3?: Array<number | null>;
  soilWaterMaxM3M3?: Array<number | null>;
}

export interface IChamanMeteoMetricAvailability {
  temperature?: number;
  dewPoint?: number;
  relativeHumidity?: number;
  surfacePressure?: number;
  wind10m?: number;
  wind2m?: number;
  windDirection?: number;
  precipitation?: number;
  shortwaveRadiation?: number;
  thermalRadiation?: number;
  netRadiation?: number;
  vpd?: number;
  et0?: number;
  skinTemperature?: number;
  snowCover?: number;
  snowDepth?: number;
  soilTemperature?: Array<number>;
  soilWater?: Array<number>;
}

export interface IChamanMeteoHourlyRaw {
  _id?: string;
  gridPointKey: string;
  timestamp: string;
  provider: "copernicus-cds";
  dataset: "reanalysis-era5-land-timeseries";
  sourceVersion: string;
  values: IChamanMeteoRawValues;
  qualityFlags: string[];
  importedAt: string;
}

export interface IChamanMeteoHourlyDerived {
  _id?: string;
  gridPointKey: string;
  timestamp: string;
  calculationVersion: string;
  values: IChamanMeteoHourlyValues;
  qualityFlags: string[];
  calculatedAt: string;
}

export interface IChamanMeteoDaily {
  _id?: string;
  gridPointKey: string;
  date: string;
  timezone: string;
  calculationVersion: string;
  hoursAvailable: number;
  hoursExpected: number;
  values: IChamanMeteoDailyValues;
  availableHoursByMetric?: IChamanMeteoMetricAvailability;
  qualityFlags: string[];
  calculatedAt: string;
}

export interface IChamanMeteoCoverage {
  _id?: string;
  gridPointKey: string;
  calculationVersion?: string;
  sourceVersion?: string;
  hourlyRawFrom?: string;
  hourlyRawTo?: string;
  hourlyDerivedFrom?: string;
  hourlyDerivedTo?: string;
  dailyFrom?: string;
  dailyTo?: string;
  hourlyRawCount: number;
  hourlyDerivedCount: number;
  dailyCount: number;
  lastSuccessfulImportAt?: string;
  actualizadoEn?: string;
}

export interface IChamanMeteoImportJob {
  _id?: string;
  jobKey: string;
  type: ChamanMeteoJobType;
  gridPointKey?: string;
  sourceVersion?: string;
  calculationVersion?: string;
  rangeStart: string;
  rangeEnd: string;
  retrievalStart?: string;
  retrievalEnd?: string;
  status: ChamanMeteoJobStatus;
  progressPct: number;
  attempts: number;
  recordsDownloaded?: number;
  recordsStored?: number;
  lastError?: string;
  startedAt?: string;
  heartbeatAt?: string;
  finishedAt?: string;
  creadoEn?: string;
  actualizadoEn?: string;
}

export interface IChamanMeteoStorageStatus {
  calculationVersion?: string;
  sourceVersion?: string;
  gridPoints: number;
  activeBindings: number;
  hourlyRawRecords: number;
  hourlyDerivedRecords: number;
  dailyRecords: number;
  jobsByStatus: Record<ChamanMeteoJobStatus, number>;
  latestJob?: IChamanMeteoImportJob;
  latestProblemJob?: IChamanMeteoImportJob;
  latestCoverage?: IChamanMeteoCoverage;
}

export interface IChamanMeteoAdminStatus extends IChamanMeteoStorageStatus {
  service: "Chaman-Meteo";
  enabled: boolean;
  importEnabled: boolean;
  credentialConfigured: boolean;
  provider: "Copernicus Climate Data Store";
  dataset: "ERA5-Land time-series";
  historicalStart: string;
  calculationVersion: string;
  operationalSourceUnchanged: boolean;
  agrometBridgeEnabled?: boolean;
  agrometAutoProvisionEnabled?: boolean;
  agrometAutoProvisionFrom?: string;
  agrometPilotLots?: number;
  agrometPilotSowings?: number;
  configurationValid: boolean;
  lastError?: string;
  state: "DISABLED" | "READY" | "IMPORTING" | "AVAILABLE" | "ERROR";
  checkedAt: string;
}

export interface IChamanMeteoPage<T> {
  datos: T[];
  total: number;
  limit: number;
  offset: number;
}
