import mongoose from 'mongoose';

const timestamps = { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' };

export const CHAMAN_METEO_GRID_POINT_MODEL = 'ChamanMeteoGridPoint';
export const CHAMAN_METEO_LOCATION_BINDING_MODEL = 'ChamanMeteoLocationBinding';
export const CHAMAN_METEO_HOURLY_RAW_MODEL = 'ChamanMeteoHourlyRaw';
export const CHAMAN_METEO_VERSIONED_HOURLY_RAW_MODEL =
  'ChamanMeteoVersionedHourlyRaw';
export const CHAMAN_METEO_HOURLY_DERIVED_MODEL = 'ChamanMeteoHourlyDerived';
export const CHAMAN_METEO_DAILY_MODEL = 'ChamanMeteoDaily';
export const CHAMAN_METEO_COVERAGE_MODEL = 'ChamanMeteoCoverage';
export const CHAMAN_METEO_VERSIONED_COVERAGE_MODEL =
  'ChamanMeteoVersionedCoverage';
export const CHAMAN_METEO_IMPORT_JOB_MODEL = 'ChamanMeteoImportJob';

function isValidIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const ChamanMeteoGridPointSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    countryCode: {
      type: String,
      enum: ['AR', 'UY', 'PY', 'BR', 'CL'],
      required: true,
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: isValidIanaTimezone,
        message: 'timezone debe ser una zona IANA valida.',
      },
    },
    enabled: { type: Boolean, default: true },
    provider: {
      type: String,
      enum: ['copernicus-cds'],
      default: 'copernicus-cds',
      required: true,
    },
    dataset: {
      type: String,
      enum: ['reanalysis-era5-land-timeseries'],
      default: 'reanalysis-era5-land-timeseries',
      required: true,
    },
    historicalStart: { type: String, required: true },
    latestAvailable: { type: Date },
    firstDataAt: { type: Date },
    lastDataAt: { type: Date },
  },
  { collection: 'weather_grid_points', timestamps },
);
ChamanMeteoGridPointSchema.index(
  { key: 1 },
  { unique: true, name: 'uniq_weather_grid_point_key' },
);
ChamanMeteoGridPointSchema.index(
  { enabled: 1, countryCode: 1 },
  { name: 'weather_grid_enabled_country' },
);

export const ChamanMeteoLocationBindingSchema = new mongoose.Schema(
  {
    locationType: {
      type: String,
      enum: ['establecimiento', 'lote'],
      required: true,
    },
    locationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    gridPointKey: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    distanceKm: { type: Number, required: true, min: 0 },
    active: { type: Boolean, default: true },
  },
  { collection: 'weather_location_bindings', timestamps },
);
ChamanMeteoLocationBindingSchema.index(
  { locationType: 1, locationId: 1 },
  { unique: true, name: 'uniq_weather_location_binding' },
);
ChamanMeteoLocationBindingSchema.index(
  { gridPointKey: 1, active: 1 },
  { name: 'weather_binding_grid_active' },
);

export const ChamanMeteoHourlyRawSchema = new mongoose.Schema(
  {
    gridPointKey: { type: String, required: true },
    timestamp: { type: Date, required: true },
    provider: {
      type: String,
      enum: ['copernicus-cds'],
      required: true,
    },
    dataset: {
      type: String,
      enum: ['reanalysis-era5-land-timeseries'],
      required: true,
    },
    sourceVersion: { type: String, required: true },
    values: { type: Object, required: true },
    qualityFlags: { type: [String], default: [] },
    importedAt: { type: Date, required: true },
  },
  { collection: 'weather_hourly_raw', timestamps },
);
ChamanMeteoHourlyRawSchema.index(
  { gridPointKey: 1, timestamp: 1 },
  { unique: true, name: 'uniq_weather_hourly_raw_grid_time' },
);

// Additive v2 RAW storage. Never route v2 writes through weather_hourly_raw:
// that collection and its original unique index belong to the rollback-safe
// v1 path.
export const ChamanMeteoVersionedHourlyRawSchema = new mongoose.Schema(
  {
    gridPointKey: { type: String, required: true },
    timestamp: { type: Date, required: true },
    provider: {
      type: String,
      enum: ['copernicus-cds'],
      required: true,
    },
    dataset: {
      type: String,
      enum: ['reanalysis-era5-land-timeseries'],
      required: true,
    },
    sourceVersion: { type: String, required: true },
    values: { type: Object, required: true },
    qualityFlags: { type: [String], default: [] },
    importedAt: { type: Date, required: true },
  },
  { collection: 'weather_hourly_raw_versions', timestamps },
);
ChamanMeteoVersionedHourlyRawSchema.index(
  { gridPointKey: 1, sourceVersion: 1, timestamp: 1 },
  { unique: true, name: 'uniq_weather_hourly_raw_version' },
);
ChamanMeteoVersionedHourlyRawSchema.index(
  { gridPointKey: 1, sourceVersion: 1, timestamp: -1 },
  { name: 'weather_hourly_raw_version_timestamp_desc' },
);
ChamanMeteoVersionedHourlyRawSchema.index(
  { sourceVersion: 1 },
  { name: 'weather_hourly_raw_source_version' },
);

export const ChamanMeteoHourlyDerivedSchema = new mongoose.Schema(
  {
    gridPointKey: { type: String, required: true },
    timestamp: { type: Date, required: true },
    calculationVersion: { type: String, required: true },
    values: { type: Object, required: true },
    qualityFlags: { type: [String], default: [] },
    calculatedAt: { type: Date, required: true },
  },
  { collection: 'weather_hourly_derived', timestamps },
);
ChamanMeteoHourlyDerivedSchema.index(
  { gridPointKey: 1, timestamp: 1, calculationVersion: 1 },
  { unique: true, name: 'uniq_weather_hourly_derived_grid_time_version' },
);
ChamanMeteoHourlyDerivedSchema.index(
  { gridPointKey: 1, calculationVersion: 1, timestamp: -1 },
  { name: 'weather_hourly_derived_grid_version_timestamp_desc' },
);
ChamanMeteoHourlyDerivedSchema.index(
  { calculationVersion: 1 },
  { name: 'weather_hourly_derived_calculation_version' },
);

export const ChamanMeteoDailySchema = new mongoose.Schema(
  {
    gridPointKey: { type: String, required: true },
    date: { type: String, required: true },
    timezone: { type: String, required: true },
    calculationVersion: { type: String, required: true },
    hoursAvailable: { type: Number, required: true, min: 0, max: 25 },
    hoursExpected: { type: Number, required: true, min: 23, max: 25 },
    values: { type: Object, required: true },
    availableHoursByMetric: { type: Object },
    qualityFlags: { type: [String], default: [] },
    calculatedAt: { type: Date, required: true },
  },
  { collection: 'weather_daily', timestamps },
);
ChamanMeteoDailySchema.index(
  { gridPointKey: 1, date: 1, calculationVersion: 1 },
  { unique: true, name: 'uniq_weather_daily_grid_date_version' },
);
ChamanMeteoDailySchema.index(
  { gridPointKey: 1, calculationVersion: 1, date: -1 },
  { name: 'weather_daily_grid_version_date_desc' },
);
ChamanMeteoDailySchema.index(
  { calculationVersion: 1 },
  { name: 'weather_daily_calculation_version' },
);

export const ChamanMeteoCoverageSchema = new mongoose.Schema(
  {
    gridPointKey: { type: String, required: true },
    calculationVersion: { type: String },
    hourlyRawFrom: { type: Date },
    hourlyRawTo: { type: Date },
    hourlyDerivedFrom: { type: Date },
    hourlyDerivedTo: { type: Date },
    dailyFrom: { type: String },
    dailyTo: { type: String },
    hourlyRawCount: { type: Number, default: 0, min: 0 },
    hourlyDerivedCount: { type: Number, default: 0, min: 0 },
    dailyCount: { type: Number, default: 0, min: 0 },
    lastSuccessfulImportAt: { type: Date },
  },
  { collection: 'weather_grid_coverage', timestamps },
);
ChamanMeteoCoverageSchema.index(
  { gridPointKey: 1 },
  { unique: true, name: 'uniq_weather_grid_coverage' },
);

// Additive v2 storage. The legacy singleton above must remain untouched so a
// rollback to the v1 binary keeps seeing only its own progress snapshot.
export const ChamanMeteoVersionedCoverageSchema = new mongoose.Schema(
  {
    gridPointKey: { type: String, required: true },
    calculationVersion: { type: String, required: true },
    sourceVersion: { type: String, required: true },
    hourlyRawFrom: { type: Date },
    hourlyRawTo: { type: Date },
    hourlyDerivedFrom: { type: Date },
    hourlyDerivedTo: { type: Date },
    dailyFrom: { type: String },
    dailyTo: { type: String },
    hourlyRawCount: { type: Number, default: 0, min: 0 },
    hourlyDerivedCount: { type: Number, default: 0, min: 0 },
    dailyCount: { type: Number, default: 0, min: 0 },
    lastSuccessfulImportAt: { type: Date },
  },
  { collection: 'weather_grid_coverage_versions', timestamps },
);
ChamanMeteoVersionedCoverageSchema.index(
  { gridPointKey: 1, calculationVersion: 1, sourceVersion: 1 },
  {
    unique: true,
    name: 'uniq_weather_grid_coverage_version',
  },
);
ChamanMeteoVersionedCoverageSchema.index(
  { calculationVersion: 1, sourceVersion: 1, lastSuccessfulImportAt: -1 },
  { name: 'weather_grid_coverage_version_latest' },
);

export const ChamanMeteoImportJobSchema = new mongoose.Schema(
  {
    jobKey: { type: String, required: true },
    type: {
      type: String,
      enum: ['BACKFILL', 'INCREMENTAL', 'REPAIR'],
      required: true,
    },
    gridPointKey: { type: String },
    sourceVersion: { type: String },
    calculationVersion: { type: String },
    rangeStart: { type: String, required: true },
    rangeEnd: { type: String, required: true },
    retrievalStart: { type: String },
    retrievalEnd: { type: String },
    status: {
      type: String,
      enum: ['PENDING', 'DOWNLOADING', 'PARTIAL', 'AVAILABLE', 'FAILED'],
      required: true,
    },
    progressPct: { type: Number, default: 0, min: 0, max: 100 },
    attempts: { type: Number, default: 0, min: 0 },
    recordsDownloaded: { type: Number, min: 0 },
    recordsStored: { type: Number, min: 0 },
    lastError: { type: String },
    startedAt: { type: Date },
    heartbeatAt: { type: Date },
    finishedAt: { type: Date },
  },
  { collection: 'weather_import_jobs', timestamps },
);
ChamanMeteoImportJobSchema.index(
  { jobKey: 1 },
  { unique: true, name: 'uniq_weather_import_job_key' },
);
ChamanMeteoImportJobSchema.index(
  { status: 1, actualizadoEn: -1 },
  { name: 'weather_job_status_updated' },
);
ChamanMeteoImportJobSchema.index(
  { calculationVersion: 1, status: 1, actualizadoEn: -1 },
  { name: 'weather_job_calculation_status_updated' },
);
ChamanMeteoImportJobSchema.index(
  { calculationVersion: 1, sourceVersion: 1, status: 1, actualizadoEn: -1 },
  { name: 'weather_job_calculation_source_status_updated' },
);
ChamanMeteoImportJobSchema.index(
  { calculationVersion: 1, sourceVersion: 1, actualizadoEn: -1 },
  { name: 'weather_job_calculation_source_updated' },
);
