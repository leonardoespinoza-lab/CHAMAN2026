// Port
export const PORT = +process.env.PORT || 5008;
// Env
export type Envs = 'local' | 'dev' | 'test' | 'production';
export const ENV: Envs = (process.env.ENV as Envs) || 'local';
const PREFIX = process.env.PREFIX || 'clima';
export const PREFIX_PATH =
  ENV === 'production'
    ? PREFIX
    : ENV === 'test'
      ? `${PREFIX}-test`
      : ENV === 'dev'
        ? `${PREFIX}-dev`
        : 'local';
export const DEBUG =
  process.env.DEBUG === 'true' ? true : ENV === 'local' ? true : false;
// APIS
export const API_DATOS = process.env.API_DATOS || 'http://127.0.0.1:5000';
// Field Climate
export const API_FIELD_CLIMATE =
  process.env.API_FIELD_CLIMATE || 'https://api.fieldclimate.com/v2';
export const PUBLIC_KEY = process.env.PUBLIC_KEY || '';
export const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

export const FIELD_CLIMATE_USERS: string[] = JSON.parse(
  process.env.FIELD_CLIMATE_USERS || '[]',
);
export const FIELD_CLIMATE_PASS: string[] = JSON.parse(
  process.env.FIELD_CLIMATE_PASS || '[]',
);
export const FIELDCLIMATE_CREDENTIALS_KEY =
  process.env.FIELDCLIMATE_CREDENTIALS_KEY || '';
export const FIELDCLIMATE_OAUTH_CLIENT_ID =
  process.env.FIELDCLIMATE_OAUTH_CLIENT_ID || 'FieldclimateNG';
export const FIELDCLIMATE_OAUTH_CLIENT_SECRET =
  process.env.FIELDCLIMATE_OAUTH_CLIENT_SECRET || '';

// Open Weather
export const API_OPEN_WEATHER =
  process.env.API_WEATHER_BIT || 'https://api.openweathermap.org/data/2.5';
export const OPEN_WEATHER_KEY = process.env.OPEN_WEATHER_KEY || '';

// Open-Meteo comercial usa los mismos paths que la API publica, pero en los
// hosts customer y con `apikey` como query param. La clave se lee unicamente
// desde el entorno; nunca forma parte de una URL persistida ni de los logs.
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
if (openMeteoRuntimeEnvironment === 'production' && !OPEN_METEO_API_KEY) {
  throw new Error(
    'sdc-api-clima production exige la clave comercial de Open-Meteo Forecast',
  );
}
export const OPEN_METEO_ARCHIVE_ENABLED = !!OPEN_METEO_ARCHIVE_API_KEY;

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
// Alias retrocompatibles para los consumidores existentes.
export const API_OPEN_METEO = OPEN_METEO_FORECAST_BASE_URL;
export const API_OPEN_METEO_ARCHIVE = OPEN_METEO_ARCHIVE_BASE_URL;
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

export const API_METEO_SOURCE =
  process.env.API_METEO_SOURCE || 'https://www.meteosource.com/api/v1';
export const METEO_SOURCE_KEY = process.env.METEO_SOURCE_KEY || '';

export const API_METEOBLUE =
  process.env.API_METEOBLUE || 'https://my.meteoblue.com/packages';
export const METEOBLUE_API_KEY = process.env.METEOBLUE_API_KEY || '';
export const METEOBLUE_DAILY_PACKAGE =
  process.env.METEOBLUE_DAILY_PACKAGE || 'basic-day';
export const METEOBLUE_HOURLY_PACKAGE =
  process.env.METEOBLUE_HOURLY_PACKAGE || 'basic-1h';

export const API_OMIXON =
  process.env.API_OMIXON || 'https://new.omixom.com/api/v2';
export const OMIXON_KEY = process.env.OMIXON_KEY || '';

export const API_HORATECH =
  process.env.API_HORATECH ||
  'https://apis.horatech.com.ar/agro-v2-cliente-test/apiIntegraciones';
export const API_HORATECH_APIKEY = process.env.API_HORATECH_APIKEY || '';

// Clima
export const DISTANCIA_EXCELENTE = +process.env.DISTANCIA_EXCELENTE || 30;
export const DISTANCIA_BUENA = +process.env.DISTANCIA_BUENA || 50;
export const DISTANCIA_MALA = +process.env.DISTANCIA_MALA || 100;

// TEST
export const CRON_TEST =
  process.env.CRON_TEST === 'true' ? true : false || false;

// Los cron historicos de estaciones (07:00) y calidad de lotes (00:00)
// conservan el comportamiento productivo existente. La bandera permite
// detenerlos de forma explicita durante ventanas controladas de migracion o
// recuperacion, sin deshabilitar los endpoints manuales del servicio.
export const CLIMA_LEGACY_CRONS_ENABLED =
  ENV !== 'test' &&
  (process.env.CLIMA_LEGACY_CRONS_ENABLED === undefined ||
    process.env.CLIMA_LEGACY_CRONS_ENABLED.trim().toLowerCase() === 'true');

// Motor agrometeorologico
export const AGROMETEO_CRON_ENABLED =
  process.env.AGROMETEO_CRON_ENABLED === 'true' ||
  (process.env.AGROMETEO_CRON_ENABLED !== 'false' && ENV !== 'test');
export const AGROMETEO_FORECAST_DAYS = Math.max(
  1,
  Math.min(14, +process.env.AGROMETEO_FORECAST_DAYS || 7),
);
export const AGROMETEO_CHUNK_DAYS = Math.max(
  7,
  Math.min(180, +process.env.AGROMETEO_CHUNK_DAYS || 90),
);
export const AGROMETEO_BATCH_SIZE = Math.max(
  1,
  Math.min(100, +process.env.AGROMETEO_BATCH_SIZE || 20),
);
export const FIELDCLIMATE_MAX_DATA_AGE_HOURS = Math.max(
  1,
  +process.env.FIELDCLIMATE_MAX_DATA_AGE_HOURS || 6,
);
export const AGROMETEO_INTERNAL_TOKEN =
  process.env.AGROMETEO_INTERNAL_TOKEN || '';
export const CHAMAN_METEO_INTERNAL_TOKEN =
  process.env.CHAMAN_METEO_INTERNAL_TOKEN || AGROMETEO_INTERNAL_TOKEN;
export const CHAMAN_METEO_ENABLED = process.env.CHAMAN_METEO_ENABLED === 'true';
export const CHAMAN_METEO_IMPORT_ENABLED =
  CHAMAN_METEO_ENABLED && process.env.CHAMAN_METEO_IMPORT_ENABLED === 'true';
export const CHAMAN_METEO_CDS_CONFIGURED =
  process.env.CHAMAN_METEO_CDS_CONFIGURED === 'true';
export const CHAMAN_METEO_MIN_HISTORICAL_START = '2020-01-01';
export function resolveChamanMeteoHistoricalStart(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('CHAMAN_METEO_HISTORICAL_START debe usar YYYY-MM-DD');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('CHAMAN_METEO_HISTORICAL_START no es una fecha valida');
  }
  if (value < CHAMAN_METEO_MIN_HISTORICAL_START) {
    throw new Error(
      `Chaman-Meteo solo admite historicos desde ${CHAMAN_METEO_MIN_HISTORICAL_START}`,
    );
  }
  if (value > new Date().toISOString().slice(0, 10)) {
    throw new Error(
      'CHAMAN_METEO_HISTORICAL_START esta fuera del rango ERA5-Land',
    );
  }
  return value;
}
export function resolveChamanMeteoRuntimeHistoricalStart(value?: string): {
  historicalStart: string;
  configuredStart: string;
  valid: boolean;
  error?: string;
} {
  const configuredStart = value === undefined ? '2020-01-01' : value;
  try {
    return {
      historicalStart: resolveChamanMeteoHistoricalStart(configuredStart),
      configuredStart,
      valid: true,
    };
  } catch (error) {
    return {
      historicalStart: '2020-01-01',
      configuredStart,
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
const chamanMeteoRuntimeHistoricalStart =
  resolveChamanMeteoRuntimeHistoricalStart(
    process.env.CHAMAN_METEO_HISTORICAL_START,
  );
export const CHAMAN_METEO_HISTORICAL_START =
  chamanMeteoRuntimeHistoricalStart.historicalStart;
export const CHAMAN_METEO_HISTORICAL_START_VALID =
  chamanMeteoRuntimeHistoricalStart.valid;
export const CHAMAN_METEO_HISTORICAL_START_ERROR =
  chamanMeteoRuntimeHistoricalStart.error;
export const CHAMAN_METEO_EXPECTED_CALCULATION_VERSION =
  'chaman-meteo-agro-v2';
export function resolveChamanMeteoCalculationVersion(value: string): string {
  const version = String(value ?? '');
  if (version !== CHAMAN_METEO_EXPECTED_CALCULATION_VERSION) {
    throw new Error(
      `CHAMAN_METEO_CALCULATION_VERSION debe ser exactamente ${CHAMAN_METEO_EXPECTED_CALCULATION_VERSION}`,
    );
  }
  return version;
}
export function resolveChamanMeteoRuntimeVersion(value?: string): {
  calculationVersion: string;
  configuredVersion: string;
  valid: boolean;
  error?: string;
} {
  const configuredVersion =
    value === undefined ? CHAMAN_METEO_EXPECTED_CALCULATION_VERSION : value;
  const valid = configuredVersion === CHAMAN_METEO_EXPECTED_CALCULATION_VERSION;
  return {
    calculationVersion: CHAMAN_METEO_EXPECTED_CALCULATION_VERSION,
    configuredVersion,
    valid,
    error: valid
      ? undefined
      : `CHAMAN_METEO_CALCULATION_VERSION debe ser exactamente ${CHAMAN_METEO_EXPECTED_CALCULATION_VERSION}`,
  };
}

// No se valida con un throw al importar env.ts: sdc-api-clima tambien aloja
// Open-Meteo y otros motores productivos. Una etiqueta heredada debe quedar
// aislada al modulo Chaman-Meteo y nunca impedir el arranque de toda la API.
const chamanMeteoRuntimeVersion = resolveChamanMeteoRuntimeVersion(
  process.env.CHAMAN_METEO_CALCULATION_VERSION,
);
export const CHAMAN_METEO_CALCULATION_VERSION =
  chamanMeteoRuntimeVersion.calculationVersion;
export const CHAMAN_METEO_CALCULATION_VERSION_VALID =
  chamanMeteoRuntimeVersion.valid;
export const CHAMAN_METEO_CALCULATION_VERSION_ERROR =
  chamanMeteoRuntimeVersion.error;
export const CHAMAN_METEO_EXPECTED_SOURCE_VERSION =
  'era5-land-timeseries-19var-v2';
export function resolveChamanMeteoSourceVersion(value: string): string {
  const version = String(value ?? '');
  if (version !== CHAMAN_METEO_EXPECTED_SOURCE_VERSION) {
    throw new Error(
      `CHAMAN_METEO_SOURCE_VERSION debe ser exactamente ${CHAMAN_METEO_EXPECTED_SOURCE_VERSION}`,
    );
  }
  return version;
}
export function resolveChamanMeteoRuntimeSourceVersion(value?: string): {
  sourceVersion: string;
  configuredVersion: string;
  valid: boolean;
  error?: string;
} {
  const configuredVersion =
    value === undefined ? CHAMAN_METEO_EXPECTED_SOURCE_VERSION : value;
  const valid = configuredVersion === CHAMAN_METEO_EXPECTED_SOURCE_VERSION;
  return {
    sourceVersion: CHAMAN_METEO_EXPECTED_SOURCE_VERSION,
    configuredVersion,
    valid,
    error: valid
      ? undefined
      : `CHAMAN_METEO_SOURCE_VERSION debe ser exactamente ${CHAMAN_METEO_EXPECTED_SOURCE_VERSION}`,
  };
}
const chamanMeteoRuntimeSourceVersion = resolveChamanMeteoRuntimeSourceVersion(
  process.env.CHAMAN_METEO_SOURCE_VERSION,
);
export const CHAMAN_METEO_SOURCE_VERSION =
  chamanMeteoRuntimeSourceVersion.sourceVersion;
export const CHAMAN_METEO_SOURCE_VERSION_VALID =
  chamanMeteoRuntimeSourceVersion.valid;
export const CHAMAN_METEO_SOURCE_VERSION_ERROR =
  chamanMeteoRuntimeSourceVersion.error;
export const CHAMAN_METEO_RUNTIME_CONFIGURATION_VALID =
  CHAMAN_METEO_HISTORICAL_START_VALID &&
  CHAMAN_METEO_CALCULATION_VERSION_VALID &&
  CHAMAN_METEO_SOURCE_VERSION_VALID;
export const CHAMAN_METEO_RUNTIME_CONFIGURATION_ERROR = [
  CHAMAN_METEO_HISTORICAL_START_ERROR,
  CHAMAN_METEO_CALCULATION_VERSION_ERROR,
  CHAMAN_METEO_SOURCE_VERSION_ERROR,
]
  .filter(Boolean)
  .join('; ') || undefined;

export function resolveIdentifierAllowlist(value?: string): string[] {
  return [
    ...new Set(
      String(value || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

/**
 * Puente operativo: queda apagado aunque Chaman-Meteo administrativo este
 * activo. La allowlist siempre autoriza lotes completos; una variable heredada
 * por siembra se ignora deliberadamente porque una descarga puede agrupar
 * varias siembras activas del mismo lote.
 */
export const CHAMAN_METEO_AGROMET_BRIDGE_ENABLED =
  CHAMAN_METEO_ENABLED &&
  CHAMAN_METEO_RUNTIME_CONFIGURATION_VALID &&
  process.env.CHAMAN_METEO_AGROMET_BRIDGE_ENABLED === 'true';
export const CHAMAN_METEO_AGROMET_LOT_ALLOWLIST = resolveIdentifierAllowlist(
  process.env.CHAMAN_METEO_AGROMET_LOT_ALLOWLIST,
);
/**
 * Alta automatica de puntos/bindings para lotes activos. Permanece apagada
 * por defecto y se habilita por ambiente despues de validar el backfill.
 */
export const CHAMAN_METEO_AGROMET_AUTO_PROVISION_ENABLED =
  CHAMAN_METEO_AGROMET_BRIDGE_ENABLED &&
  process.env.CHAMAN_METEO_AGROMET_AUTO_PROVISION_ENABLED === 'true';
export function resolveChamanMeteoAutoProvisionFrom(
  value?: string,
): string | undefined {
  const normalized = String(value || '').trim();
  if (!normalized) return undefined;
  try {
    return resolveChamanMeteoHistoricalStart(normalized);
  } catch {
    return undefined;
  }
}
export const CHAMAN_METEO_AGROMET_AUTO_PROVISION_FROM =
  resolveChamanMeteoAutoProvisionFrom(
    process.env.CHAMAN_METEO_AGROMET_AUTO_PROVISION_FROM,
  );
/** Hoy y los cuatro dias previos siguen exclusivamente en Open-Meteo. */
export const CHAMAN_METEO_AGROMET_RECENT_OPEN_METEO_DAYS = 5;
export const SOIL_INTELLIGENCE_INTERNAL_TOKEN =
  process.env.SOIL_INTELLIGENCE_INTERNAL_TOKEN ||
  process.env.LOT_LOCATION_INTERNAL_TOKEN ||
  AGROMETEO_INTERNAL_TOKEN;
export const AGROMETEO_FORECAST_MAX_AGE_HOURS = Math.max(
  1,
  +process.env.AGROMETEO_FORECAST_MAX_AGE_HOURS || 8,
);
