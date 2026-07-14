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
export const AGROMETEO_INTERNAL_TOKEN =
  process.env.AGROMETEO_INTERNAL_TOKEN || '';
export const LOT_LOCATION_INTERNAL_TOKEN =
  process.env.LOT_LOCATION_INTERNAL_TOKEN || '';
export const SOIL_INTELLIGENCE_INTERNAL_TOKEN =
  process.env.SOIL_INTELLIGENCE_INTERNAL_TOKEN ||
  LOT_LOCATION_INTERNAL_TOKEN ||
  AGROMETEO_INTERNAL_TOKEN;
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
  process.env.SOIL_INTELLIGENCE_CRON || '0 4 * * 0';

// Solo incluir autenticación si hay usuario Y contraseña no vacíos
const authOptions =
  DB_USER && DB_PASS && DB_USER !== '' && DB_PASS !== ''
    ? { user: DB_USER, pass: DB_PASS }
    : {};

export const DB_OPTIONS: MongooseModuleOptions = {
  ...authOptions,
  ...(DB_FULL_URI && !process.env.DB_NAME ? {} : { dbName: DB_NAME }),
  directConnection: ENV === 'local' && !DB_FULL_URI ? true : false,
};
