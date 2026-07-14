// Port
export const PORT = +process.env.PORT || 5002;
// Env
export type Envs = 'local' | 'dev' | 'test' | 'production';
export const ENV: Envs = (process.env.ENV as Envs) || 'local';
const PREFIX = process.env.PREFIX || 'sdc-quimica';
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
export const API_AUTH = process.env.API_AUTH || 'http://127.0.0.1:5001';
export const API_PREDICCIONES =
  process.env.API_PREDICCIONES || 'http://127.0.0.1:5007';
export const API_CLIMA = process.env.API_CLIMA || 'http://127.0.0.1:5008/local';
export const API_FTP =
  process.env.API_FTP || 'https://chaman-ftp-production.up.railway.app';
export const API_WEED_AI = process.env.API_WEED_AI || 'http://127.0.0.1:8080';
export const WEED_AI_TIMEOUT_MS = +process.env.WEED_AI_TIMEOUT_MS || 30000;
export const WEED_AI_STORAGE_DIR =
  process.env.WEED_AI_STORAGE_DIR || 'storage/ia-malezas';
export const WEED_AI_DISABLE_FALLBACK =
  process.env.WEED_AI_DISABLE_FALLBACK === 'true';
export const TIMELAPSE_ADMIN_TOKEN = process.env.TIMELAPSE_ADMIN_TOKEN || '';
// OAuth client used by the public gateway when talking to sdc-auth.
export const AUTH_CLIENT_ID =
  process.env.AUTH_CLIENT_ID || (ENV === 'production' ? '' : '1');
export const AUTH_CLIENT_SECRET =
  process.env.AUTH_CLIENT_SECRET || (ENV === 'production' ? '' : '1');
// MQTT
export const MQTT_ENABLED = process.env.MQTT_ENABLED === 'true';
export const MQTT_PROTOCOL = process.env.MQTT_PROTOCOL || 'ssl';
export const MQTT_HOST = process.env.MQTT_HOST || 'localhost';
export const MQTT_PORT = +process.env.MQTT_PORT || 8883;
export const MQTT_USER = process.env.MQTT_USER || '';
export const MQTT_PASS = process.env.MQTT_PASS || '';
export const MQTT_CLIENT_ID = process.env.MQTT_CLIENT_ID || 'sdc-cliente-local';
export const MQTT_TOPIC_APIS =
  process.env.MQTT_TOPIC_APIS || 'sdc-websocket-local';

// GOOGLE MAPS
export const MAPS_KEY = process.env.MAPS_KEY || '';

// REDIS
export const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
export const REDIS_PORT = +process.env.REDIS_PORT || 56826; //6379;
export const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
export const REDIS_DB = +process.env.REDIS_DB || 0;
export const REDIS_NDVI_DB = +(
  process.env.REDIS_NDVI_DB ||
  process.env.REDIS_DB ||
  0
);
export const REDIS_NDVI_QUEUE =
  process.env.REDIS_NDVI_QUEUE || process.env.REDIS_QUEUE || 'tareas-ndvi';
export const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX || 'sdc-cliente';
export const REDIS_CONNECT_TIMEOUT =
  +process.env.REDIS_CONNECT_TIMEOUT || 10000;
export const REDIS_COMMAND_TIMEOUT = +process.env.REDIS_COMMAND_TIMEOUT || 5000;
export const REDIS_RETRY_ATTEMPTS = +process.env.REDIS_RETRY_ATTEMPTS || 3;
export const REDIS_RETRY_DELAY = +process.env.REDIS_RETRY_DELAY || 1000;
export const REALTIME_TRANSPORT =
  process.env.REALTIME_TRANSPORT || (MQTT_ENABLED ? 'mqtt' : 'disabled');
export const REALTIME_CHANNEL =
  process.env.REALTIME_CHANNEL || MQTT_TOPIC_APIS || 'chaman-realtime-events';

// CACHE SETTINGS
export const TILE_CACHE_TTL = +process.env.TILE_CACHE_TTL || 3600; // 60 minutos (optimizado para datos climáticos)
export const CACHE_MAX_TILE_SIZE = +process.env.CACHE_MAX_TILE_SIZE || 5242880; // 5MB

// CLIMA
export const CLIMA_SYNC_ENABLED =
  process.env.CLIMA_SYNC_ENABLED !== 'false' && ENV !== 'test';
export const CLIMA_SYNC_INTERVAL_MS =
  +process.env.CLIMA_SYNC_INTERVAL_MS || 15 * 60 * 1000;
export const CLIMA_CACHE_TTL_MINUTES =
  +process.env.CLIMA_CACHE_TTL_MINUTES || 15;
export const FIELDCLIMATE_CREDENTIALS_KEY =
  process.env.FIELDCLIMATE_CREDENTIALS_KEY || '';
export const FIELDCLIMATE_MAX_DATA_AGE_HOURS =
  +process.env.FIELDCLIMATE_MAX_DATA_AGE_HOURS || 6;
export const AGROMETEO_INTERNAL_TOKEN =
  process.env.AGROMETEO_INTERNAL_TOKEN || '';
export const LOT_LOCATION_INTERNAL_TOKEN =
  process.env.LOT_LOCATION_INTERNAL_TOKEN || '';

// SATELITE
export const NDVI_SYNC_ENABLED =
  process.env.NDVI_SYNC_ENABLED !== 'false' && ENV !== 'test';
export const NDVI_SYNC_INTERVAL_MS =
  +process.env.NDVI_SYNC_INTERVAL_MS || 24 * 60 * 60 * 1000;
export const NDVI_SYNC_STARTUP_DELAY_MS =
  +process.env.NDVI_SYNC_STARTUP_DELAY_MS || 90 * 1000;
export const NDVI_SYNC_LIMIT = +process.env.NDVI_SYNC_LIMIT || 250;

// TILES CLIMA - CONFIGURACIÓN INDIVIDUAL POR ESTABLECIMIENTO
export const TILES_INDIVIDUAL_CONFIG = {
  // Radio proporcional al tamaño del establecimiento
  SIZE_FACTOR: +process.env.TILES_SIZE_FACTOR || 0.5, // 50% del tamaño del establecimiento
  // Límites de radio en kilómetros
  MIN_RADIUS_KM: +process.env.TILES_MIN_RADIUS_KM || 2, // Mínimo 2km
  MAX_RADIUS_KM: +process.env.TILES_MAX_RADIUS_KM || 15, // Máximo 15km
  // Padding de seguridad adicional
  SAFETY_PADDING_KM: +process.env.TILES_SAFETY_PADDING_KM || 1, // +1km de seguridad
};

// EQUIVALENCIAS
export const EQ = {
  depositoN: {
    '< 0.5': 0,
    '> 0.5': 0.33,
    '< 1.5': 0.67,
    '> 1.5': 1,
  },
  texturaLixiviacion: {
    Arcilloso: 0,
    'Franco arcilloso': 0.33,
    Franco: 0.33,
    'Franco limoso': 0.33,
    Limoso: 0.4,
    'Franco arenoso': 0.67,
    Arenoso: 1,
  },
  texturaEscorrentia: {
    Arcilloso: 0,
    'Franco arcilloso': 0.33,
    Franco: 0.33,
    'Franco limoso': 0.33,
    Limoso: 0.4,
    'Franco arenoso': 0.67,
    Arenoso: 1,
  },
  drenajeNaturalLixiviacion: {
    'Mal Drenado': 0,
    'Moderadamente Drenado': 0.33,
    'Bien Drenado': 0.67,
    'Excesivamente Drenado': 1,
  },
  drenajeNaturalEscorrentia: {
    'Mal Drenado': 0,
    'Moderadamente Drenado': 0.33,
    'Bien Drenado': 0.67,
    'Excesivamente Drenado': 1,
  },
  erosionEscorrentiaPendiente: {
    'Baja (0 - 3%)': 0,
    'Moderada (3 - 8%)': 0.33,
    'Alta (8 - 15%)': 0.67,
    'Muy Alta (> 15%)': 1,
  },
  contenidoP: {
    '< 12': 0,
    '> 12 < 20': 0.33,
    '> 20 < 30': 0.67,
    '> 30': 1,
  },
  lluviasPromedio: {
    '< 600': 0,
    '> 600 < 1200': 0.33,
    '> 1200 < 1800': 0.67,
    '> 1800': 1,
  },
  fijacionN: {
    '0': 0,
    '> 0 < 30': 0.33,
    '> 30 < 60': 0.67,
    '> 60': 1,
  },
  dosisN: {
    'Muy Baja': 0,
    Baja: 0.33,
    Alta: 0.67,
    'Muy Alta': 1,
  },
  dosisP: {
    'Muy Baja': 0,
    Baja: 0.33,
    Alta: 0.67,
    'Muy Alta': 1,
  },
  rendimiento: {
    'Muy Bajo': 1,
    Bajo: 0.67,
    Alto: 0.33,
    'Muy Alto': 0,
  },
  manejoAgronomico: {
    Malo: 1,
    Promedio: 0.67,
    Bueno: 0.33,
    Excelente: 0,
  },
  intensidadLluvias: {
    Suaves: 0,
    Moderadas: 0.33,
    Intensas: 0.67,
    'Muy Intensas': 1,
  },
  materiaOrganica: {
    '< 1': 1,
    '> 1 < 3': 0.67,
    '> 3 < 5': 0.33,
    '> 5': 0,
  },
};

export const PESOS_N = {
  depositoN: 10,
  texturaLixiviacion: 15,
  texturaEscorrentia: 10,
  drenajeNaturalLixiviacion: 15,
  drenajeNaturalEscorrentia: 10,
  lluviasPromedio: 15,
  fijacionN: 10,
  dosisN: 0,
  rendimiento: 0,
  manejoAgronomico: 15,
};

export const PESOS_P = {
  texturaLixiviacion: 25,
  erosionEscorrentiaPendiente: 25,
  contenidoP: 20,
  intensidadLluvias: 15,
  dosisP: 0,
  rendimiento: 0,
  manejoAgronomico: 15,
};

export const PESOS_CPP = {
  koc: 20,
  persistenciaLixiviacion: 15,
  persistenciaEscorrentia: 10,
  texturaLixiviacion: 15,
  texturaEscorrentia: 10,
  materiaOrganica: 10,
  intensidadLluvias: 5,
  lluviasPromedio: 5,
  manejoAgronomico: 10,
};

export const EXTRACCION_N = {
  Soja: 55,
  Trigo: 20.55,
  Maiz: 15,
  Papa: 4.5,
  Vid: 2.2,
  Peral: 0.65,
  Pecan: 12,
  Manzano: 0.65,
};

export const EXTRACCION_P = {
  Soja: 6.12997,
  Trigo: 3.99,
  Maiz: 3.0228,
  Papa: 0.7,
  Vid: 0.35,
  Peral: 0.12,
  Pecan: 1.2,
  Manzano: 0.12,
};

export const KCAL_X_KG = {
  Maiz: 3650,
  Trigo: 3400,
  Soja: 4100,
  Papa: 770,
  Vid: 690,
  Peral: 570,
  Pecan: 6910,
  Manzano: 520,
};
