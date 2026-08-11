import { MongooseModuleOptions } from '@nestjs/mongoose';

export const VERSION = '1.0.0';
export const PORT = process.env.PORT || 5000;
export type Envs = 'local' | 'dev' | 'test' | 'production';
export const ENV: Envs = (process.env.ENV as Envs) || 'local';
export const PREFIX_PATH = process.env.PREFIX_PATH || '';

// Database
const DB_FULL_URI =
  process.env.MONGO_URI || process.env.MONGO_URL || process.env.DATABASE_URL;
export const DB_HOST = process.env.DB_HOST || 'localhost';
export const DB_PORT = process.env.DB_PORT || '27017';
export const DB_NAME = process.env.DB_NAME || 'chaman';
export const DB_USER = process.env.DB_USER || '';
export const DB_PASS = process.env.DB_PASS || '';

export const DB_URL = DB_FULL_URI || `mongodb://${DB_HOST}:${DB_PORT}`;
export const DB_AUTO_INDEX_ENABLED =
  process.env.DB_AUTO_INDEX_ENABLED === 'true';
export const AGROMETEO_INTERNAL_TOKEN =
  process.env.AGROMETEO_INTERNAL_TOKEN || '';
export const LOT_LOCATION_INTERNAL_TOKEN =
  process.env.LOT_LOCATION_INTERNAL_TOKEN || '';
export const SOIL_INTELLIGENCE_INTERNAL_TOKEN =
  process.env.SOIL_INTELLIGENCE_INTERNAL_TOKEN ||
  LOT_LOCATION_INTERNAL_TOKEN ||
  AGROMETEO_INTERNAL_TOKEN;

// Open-Meteo comercial. Las credenciales nunca forman parte de la URL base:
// el cliente las agrega exclusivamente al request en memoria y solo para el
// hostname customer oficial que corresponde a forecast o archive.
export const OPEN_METEO_API_KEY = (process.env.OPEN_METEO_API_KEY || '').trim();
export const OPEN_METEO_ARCHIVE_API_KEY = (
  process.env.OPEN_METEO_ARCHIVE_API_KEY || ''
).trim();
const openMeteoRuntimeEnvironment = String(
  process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.ENV ||
    process.env.NODE_ENV ||
    '',
)
  .trim()
  .toLowerCase();
const openMeteoStrictProduction = openMeteoRuntimeEnvironment === 'production';
if (
  openMeteoStrictProduction &&
  (!OPEN_METEO_API_KEY || !OPEN_METEO_ARCHIVE_API_KEY)
) {
  throw new Error(
    'sdc-datos production exige claves comerciales separadas de Open-Meteo para forecast y archive',
  );
}

export function resolveOpenMeteoBaseUrl(
  value: string,
  kind: 'forecast' | 'archive',
  hasApiKey: boolean,
  variableName: string,
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} debe ser una URL valida de Open-Meteo`);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${variableName} debe usar HTTPS sin credenciales, puerto, query ni fragmento`,
    );
  }
  const expectedPublicHost =
    kind === 'forecast' ? 'api.open-meteo.com' : 'archive-api.open-meteo.com';
  const expectedCustomerHost =
    kind === 'forecast'
      ? 'customer-api.open-meteo.com'
      : 'customer-archive-api.open-meteo.com';
  const host = url.hostname.toLowerCase();
  if (host !== expectedPublicHost && host !== expectedCustomerHost) {
    throw new Error(
      `${variableName} debe apuntar al host oficial de Open-Meteo para ${kind}`,
    );
  }
  if (hasApiKey !== (host === expectedCustomerHost)) {
    throw new Error(
      `${variableName} no coincide con la configuracion de API key de Open-Meteo`,
    );
  }
  return url.toString().replace(/\/$/, '');
}

const openMeteoForecastCandidate =
  process.env.OPEN_METEO_FORECAST_BASE_URL ||
  (OPEN_METEO_API_KEY
    ? 'https://customer-api.open-meteo.com/v1'
    : process.env.API_OPEN_METEO || 'https://api.open-meteo.com/v1');
const openMeteoArchiveCandidate =
  process.env.OPEN_METEO_ARCHIVE_BASE_URL ||
  (OPEN_METEO_ARCHIVE_API_KEY
    ? 'https://customer-archive-api.open-meteo.com/v1'
    : 'https://archive-api.open-meteo.com/v1');
export const OPEN_METEO_FORECAST_BASE_URL = resolveOpenMeteoBaseUrl(
  openMeteoForecastCandidate,
  'forecast',
  !!OPEN_METEO_API_KEY,
  'OPEN_METEO_FORECAST_BASE_URL',
);
export const OPEN_METEO_ARCHIVE_BASE_URL = resolveOpenMeteoBaseUrl(
  openMeteoArchiveCandidate,
  'archive',
  !!OPEN_METEO_ARCHIVE_API_KEY,
  'OPEN_METEO_ARCHIVE_BASE_URL',
);

const openMeteoNumber = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  integer = false,
): number => {
  const parsed =
    value === undefined || value.trim() === '' ? NaN : Number(value);
  const resolved = Number.isFinite(parsed) ? parsed : fallback;
  const bounded = Math.min(max, Math.max(min, resolved));
  return integer ? Math.trunc(bounded) : bounded;
};
export const OPEN_METEO_MAX_CONCURRENCY = openMeteoNumber(
  process.env.OPEN_METEO_MAX_CONCURRENCY,
  2,
  1,
  8,
  true,
);
export const OPEN_METEO_MIN_INTERVAL_MS = openMeteoNumber(
  process.env.OPEN_METEO_MIN_INTERVAL_MS,
  300,
  0,
  60_000,
);
export const OPEN_METEO_TIMEOUT_MS = openMeteoNumber(
  process.env.OPEN_METEO_TIMEOUT_MS,
  12_000,
  1000,
  120_000,
);
export const OPEN_METEO_MAX_RETRIES = openMeteoNumber(
  process.env.OPEN_METEO_MAX_RETRIES,
  1,
  0,
  2,
  true,
);
export const GEOREF_SYNC_ENABLED =
  process.env.GEOREF_SYNC_ENABLED !== 'false' &&
  process.env.NODE_ENV !== 'test';
export const GEOREF_BASE_URL =
  process.env.GEOREF_BASE_URL || 'https://apis.datos.gob.ar/georef/api/v2.0';
export const GEOREF_SYNC_CRON = process.env.GEOREF_SYNC_CRON || '15 3 * * 0';
export const GEOREF_SYNC_STARTUP_DELAY_MS =
  +process.env.GEOREF_SYNC_STARTUP_DELAY_MS || 30_000;
export const GEOREF_SYNC_STARTUP_RETRY_MS =
  +process.env.GEOREF_SYNC_STARTUP_RETRY_MS || 60_000;
export const GEOREF_SYNC_STARTUP_RETRY_MAX_MS =
  +process.env.GEOREF_SYNC_STARTUP_RETRY_MAX_MS || 5 * 60_000;
export const GEOREF_SYNC_STARTUP_MAX_ATTEMPTS =
  +process.env.GEOREF_SYNC_STARTUP_MAX_ATTEMPTS || 10;
export const GEOREF_SYNC_LOCK_TTL_MS =
  +process.env.GEOREF_SYNC_LOCK_TTL_MS || 30 * 60_000;
export const GEOREF_REQUEST_TIMEOUT_MS =
  +process.env.GEOREF_REQUEST_TIMEOUT_MS || 120_000;
const georefRequestRetries = Number(process.env.GEOREF_REQUEST_RETRIES);
export const GEOREF_REQUEST_RETRIES =
  Number.isFinite(georefRequestRetries) && georefRequestRetries >= 0
    ? georefRequestRetries
    : 3;
export const GEOREF_RETRY_BASE_DELAY_MS =
  +process.env.GEOREF_RETRY_BASE_DELAY_MS || 1_000;
export const GEOREF_BACKFILL_LIMIT = +process.env.GEOREF_BACKFILL_LIMIT || 0;
export const GEOREF_LOCALITY_MAX_DISTANCE_METERS =
  +process.env.GEOREF_LOCALITY_MAX_DISTANCE_METERS || 100_000;
export const GEOREF_SETTLEMENT_MAX_DISTANCE_METERS =
  +process.env.GEOREF_SETTLEMENT_MAX_DISTANCE_METERS || 25_000;
export const LOT_LOCATION_RESOLVER_VERSION =
  process.env.LOT_LOCATION_RESOLVER_VERSION || 'lot-location-v1.0.0';
export const SOIL_INTELLIGENCE_ENABLED =
  process.env.SOIL_INTELLIGENCE_ENABLED !== 'false' &&
  process.env.NODE_ENV !== 'test';
export const SOIL_INTELLIGENCE_STARTUP_DELAY_MS =
  +process.env.SOIL_INTELLIGENCE_STARTUP_DELAY_MS || 45_000;
export const SOIL_INTELLIGENCE_STARTUP_BACKFILL_LIMIT =
  +process.env.SOIL_INTELLIGENCE_STARTUP_BACKFILL_LIMIT || 0;
export const SOIL_INTELLIGENCE_RECOVERY_LIMIT =
  +process.env.SOIL_INTELLIGENCE_RECOVERY_LIMIT || 2;
export const SOIL_INTELLIGENCE_CRON =
  process.env.SOIL_INTELLIGENCE_CRON || '*/2 * * * *';

// Solo incluir autenticación si hay usuario Y contraseña no vacíos
const authOptions =
  DB_USER && DB_PASS && DB_USER !== '' && DB_PASS !== ''
    ? { user: DB_USER, pass: DB_PASS }
    : {};

export const DB_OPTIONS: MongooseModuleOptions = {
  ...authOptions,
  ...(DB_FULL_URI && !process.env.DB_NAME ? {} : { dbName: DB_NAME }),
  directConnection: ENV === 'local' && !DB_FULL_URI ? true : false,
  // Production indexes are promoted only through reviewed, reversible
  // migrations. Schema synchronization must be an explicit local/test opt-in.
  autoIndex: DB_AUTO_INDEX_ENABLED,
};
