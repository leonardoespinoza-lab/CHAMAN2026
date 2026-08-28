export const VERSION = '1.0.0';
// Port
export const PORT = +process.env.PORT || 5007;
// Env
export type Envs = 'local' | 'dev' | 'test' | 'production';
export const ENV: Envs = (process.env.ENV as Envs) || 'local';
const PREFIX = process.env.PREFIX || 'sdc-predicciones';
export const PREFIX_PATH =
  ENV === 'production'
    ? PREFIX
    : ENV === 'test'
      ? `${PREFIX}-test`
      : ENV === 'dev'
        ? `${PREFIX}-dev`
        : '';
// APIS
export const API_DATOS = process.env.API_DATOS || 'http://127.0.0.1:5000';
export const SOIL_INTELLIGENCE_INTERNAL_TOKEN =
  process.env.SOIL_INTELLIGENCE_INTERNAL_TOKEN ||
  process.env.LOT_LOCATION_INTERNAL_TOKEN ||
  process.env.AGROMETEO_INTERNAL_TOKEN ||
  '';
export const AGROMETEO_INTERNAL_TOKEN =
  process.env.AGROMETEO_INTERNAL_TOKEN || SOIL_INTELLIGENCE_INTERNAL_TOKEN;
export const API_CLIMA = process.env.API_CLIMA || 'http://127.0.0.1:5008/local';
// Open-Meteo comercial: la clave vive solo en variables de entorno y se
// adjunta al request en memoria. Si hay clave, el host customer es el default.
export const OPEN_METEO_API_KEY = (process.env.OPEN_METEO_API_KEY || '').trim();
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
    'sdc-api-predicciones production exige una clave comercial de Open-Meteo forecast',
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
export const OPEN_METEO_FORECAST_BASE_URL = resolveOpenMeteoBaseUrl(
  openMeteoForecastCandidate,
  'forecast',
  !!OPEN_METEO_API_KEY,
  'OPEN_METEO_FORECAST_BASE_URL',
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
// CRON
// Conserva por defecto el cron sanitario diario existente. En una ventana de
// migracion se puede apagar de forma explicita sin bloquear el reproceso
// manual y sin cambiar el comportamiento de produccion.
export const PREDICCIONES_SANITARIAS_CRON_ENABLED =
  ENV !== 'test' &&
  (process.env.PREDICCIONES_SANITARIAS_CRON_ENABLED === undefined ||
    process.env.PREDICCIONES_SANITARIAS_CRON_ENABLED.trim().toLowerCase() ===
      'true');
export const PREDICCIONES_MALEZAS_CRON_ENABLED =
  process.env.PREDICCIONES_MALEZAS_CRON_ENABLED !== 'false' && ENV !== 'test';
export const PREDICCIONES_MALEZAS_LIMIT =
  +process.env.PREDICCIONES_MALEZAS_LIMIT || 1000;
export const PREDICCIONES_AGROCLIMA_CRON_ENABLED =
  process.env.PREDICCIONES_AGROCLIMA_CRON_ENABLED !== 'false' && ENV !== 'test';
export const PREDICCIONES_AGROCLIMA_LIMIT =
  +process.env.PREDICCIONES_AGROCLIMA_LIMIT || 300;
/**
 * Opt-in estricto: mientras no exista calibracion operativa completa el cron
 * de riego no debe emitir recomendaciones ni integraciones automaticamente.
 */
export const RIEGO_CRON_ENABLED =
  process.env.RIEGO_CRON_ENABLED === 'true' && ENV !== 'test';
// MAIL
export const MAIL_HOST = process.env.MAIL_HOST;
export const MAIL_PORT = +process.env.MAIL_PORT;
export const MAIL_USER = process.env.MAIL_USER;
export const MAIL_PASS = process.env.MAIL_PASS;
