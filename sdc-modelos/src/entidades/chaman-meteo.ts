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

export interface IChamanMeteoRawValues {
  temperatureK?: number;
  dewPointK?: number;
  surfacePressurePa?: number;
  windU10Ms?: number;
  windV10Ms?: number;
  precipitationM?: number;
  shortwaveRadiationJm2?: number;
  thermalRadiationJm2?: number;
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
  precipitationMm?: number;
  windSpeedMeanMs?: number;
  windSpeedMaxMs?: number;
  shortwaveRadiationMjM2?: number;
  et0Mm?: number;
  vpdMeanKpa?: number;
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
  qualityFlags: string[];
  calculatedAt: string;
}

export interface IChamanMeteoCoverage {
  _id?: string;
  gridPointKey: string;
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
  rangeStart: string;
  rangeEnd: string;
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
  gridPoints: number;
  activeBindings: number;
  hourlyRawRecords: number;
  hourlyDerivedRecords: number;
  dailyRecords: number;
  jobsByStatus: Record<ChamanMeteoJobStatus, number>;
  latestJob?: IChamanMeteoImportJob;
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
  state: "DISABLED" | "READY" | "IMPORTING" | "AVAILABLE" | "ERROR";
  checkedAt: string;
}

export interface IChamanMeteoPage<T> {
  datos: T[];
  total: number;
  limit: number;
  offset: number;
}
