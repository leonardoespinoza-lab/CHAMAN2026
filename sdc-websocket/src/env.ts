// Port
export const PORT = +process.env.PORT || 5006;
// Env
export type Envs = 'local' | 'dev' | 'test' | 'production';
export const ENV: Envs = (process.env.ENV as Envs) || 'local';
const PREFIX = process.env.PREFIX || 'sdc-websocket';
export const PREFIX_PATH =
  ENV === 'production'
    ? PREFIX
    : ENV === 'test'
    ? `${PREFIX}-test`
    : ENV === 'dev'
    ? `${PREFIX}-dev`
    : '';
// APIS
export const API_DATOS =
  process.env.API_DATOS || 'http://localhost:5000';
export const API_AUTH =
  process.env.API_AUTH || 'http://localhost:5001';

const PROD_ENVS = new Set(['production', 'prod']);

function parseCsv(value?: string): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isProduction(env?: string): boolean {
  return PROD_ENVS.has((env || '').toLowerCase());
}

export const WEBSOCKET_ALLOWED_ORIGINS: true | string[] = (() => {
  const configured = parseCsv(
    process.env.WEBSOCKET_CORS_ORIGINS || process.env.CORS_ORIGINS,
  );
  if (configured.length) {
    return configured;
  }
  if (ENV === 'local') {
    return true;
  }
  return [
    'https://app.chamanagro.ar',
    'https://chaman2026-production.up.railway.app',
    'https://chamanagro.ar',
    'https://www.chamanagro.ar',
  ];
})();
export const WEBSOCKET_MAX_PAYLOAD_BYTES = Math.max(
  1024,
  +(process.env.WEBSOCKET_MAX_PAYLOAD_BYTES || 16 * 1024),
);
export const WEBSOCKET_AUTH_TIMEOUT_MS = Math.max(
  1000,
  +(process.env.WEBSOCKET_AUTH_TIMEOUT_MS || 10_000),
);
export const WEBSOCKET_MAX_IDENTITY_LENGTH = Math.max(
  256,
  +(process.env.WEBSOCKET_MAX_IDENTITY_LENGTH || 8_192),
);
// MQTT
export const MQTT_PROTOCOL = process.env.MQTT_PROTOCOL || 'tcp';
export const MQTT_HOST = process.env.MQTT_HOST || 'broker-emqx';
export const MQTT_PORT = +process.env.MQTT_PORT || 1883;
export const MQTT_USER = process.env.MQTT_USER;
export const MQTT_PASS = process.env.MQTT_PASS;
export const MQTT_CLIENT_ID =
  process.env.MQTT_CLIENT_ID || 'sdc-websocket-local';
export const MQTT_TOPIC_APIS =
  process.env.MQTT_TOPIC_APIS || 'sdc-websocket-local';
export const REALTIME_TRANSPORT = process.env.REALTIME_TRANSPORT || 'disabled';
export const REALTIME_CHANNEL =
  process.env.REALTIME_CHANNEL || MQTT_TOPIC_APIS || 'chaman-realtime-events';
export const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
export const REDIS_PORT = +process.env.REDIS_PORT || 6379;
export const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
export const REDIS_DB = +process.env.REDIS_DB || 0;
