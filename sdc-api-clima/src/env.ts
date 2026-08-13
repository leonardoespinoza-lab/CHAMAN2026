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
export const SOIL_INTELLIGENCE_INTERNAL_TOKEN =
  process.env.SOIL_INTELLIGENCE_INTERNAL_TOKEN ||
  process.env.LOT_LOCATION_INTERNAL_TOKEN ||
  AGROMETEO_INTERNAL_TOKEN;
export const AGROMETEO_FORECAST_MAX_AGE_HOURS = Math.max(
  1,
  +process.env.AGROMETEO_FORECAST_MAX_AGE_HOURS || 8,
);
