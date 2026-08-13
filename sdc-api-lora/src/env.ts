// Port
export const PORT = +process.env.PORT || 5012;
// Env
export type Envs = 'local' | 'dev' | 'test' | 'production';
export const ENV: Envs = (process.env.ENV as Envs) || 'local';
export const PREFIX = process.env.PREFIX || '';
export const DEBUG =
  process.env.DEBUG === 'true' ? true : ENV === 'local' ? true : false;
// APIS
export const API_DATOS = process.env.API_DATOS || 'http://localhost:5000';

// APIKEY CHIRPSTACK
export const APIKEY_CHIRPSTACK = process.env.APIKEY_CHIRPSTACK || '';

// LoRaWAN MQTT / EMQX
export const LORAWAN_MQTT_URL =
  process.env.LORAWAN_MQTT_URL || process.env.EMQX_MQTT_URL || '';
export const LORAWAN_MQTT_USERNAME =
  process.env.LORAWAN_MQTT_USERNAME || process.env.EMQX_MQTT_USERNAME || '';
export const LORAWAN_MQTT_PASSWORD =
  process.env.LORAWAN_MQTT_PASSWORD || process.env.EMQX_MQTT_PASSWORD || '';
export const LORAWAN_MQTT_CLIENT_ID =
  process.env.LORAWAN_MQTT_CLIENT_ID || `chaman-lorawan-${ENV}`;
export const LORAWAN_MQTT_TOPIC =
  process.env.LORAWAN_MQTT_TOPIC || 'application/+/device/+/rx';
export const LORAWAN_MQTT_TOPICS =
  process.env.LORAWAN_MQTT_TOPICS || LORAWAN_MQTT_TOPIC;
export const LORAWAN_MQTT_ENABLED =
  (process.env.LORAWAN_MQTT_ENABLED || 'true').toLowerCase() !== 'false';
export const LORAWAN_MQTT_QOS = Number(process.env.LORAWAN_MQTT_QOS || 0);

export const LORAWAN_MQTT_SECONDARY_URL =
  process.env.LORAWAN_MQTT_SECONDARY_URL || '';
export const LORAWAN_MQTT_SECONDARY_USERNAME =
  process.env.LORAWAN_MQTT_SECONDARY_USERNAME || '';
export const LORAWAN_MQTT_SECONDARY_PASSWORD =
  process.env.LORAWAN_MQTT_SECONDARY_PASSWORD || '';
export const LORAWAN_MQTT_SECONDARY_CLIENT_ID =
  process.env.LORAWAN_MQTT_SECONDARY_CLIENT_ID ||
  `${LORAWAN_MQTT_CLIENT_ID}-secondary`;
export const LORAWAN_MQTT_SECONDARY_TOPICS =
  process.env.LORAWAN_MQTT_SECONDARY_TOPICS ||
  process.env.LORAWAN_MQTT_SECONDARY_TOPIC ||
  'application/+/device/+/event/up';

// Inventario ChirpStack v4 -> Chaman (solo metadatos, nunca claves OTAA).
export const CHIRPSTACK_DEVICE_SYNC_ENABLED =
  (process.env.CHIRPSTACK_DEVICE_SYNC_ENABLED || 'false').toLowerCase() ===
  'true';
export const CHIRPSTACK_GRPC_ADDRESS =
  process.env.CHIRPSTACK_GRPC_ADDRESS || 'chirpstack-ns.railway.internal:8080';
export const CHIRPSTACK_API_TOKEN = (
  process.env.CHIRPSTACK_API_TOKEN || ''
).trim();
export const LORAWAN_CATALOG_INTERNAL_TOKEN = (
  process.env.LORAWAN_CATALOG_INTERNAL_TOKEN || ''
).trim();
export const CHIRPSTACK_TENANT_ID = (
  process.env.CHIRPSTACK_TENANT_ID || ''
).trim();
export const CHIRPSTACK_DEVICE_SYNC_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.CHIRPSTACK_DEVICE_SYNC_INTERVAL_MS || 300_000),
);
export const CHIRPSTACK_DEVICE_SYNC_STARTUP_DELAY_MS = Math.max(
  5_000,
  Number(process.env.CHIRPSTACK_DEVICE_SYNC_STARTUP_DELAY_MS || 30_000),
);

if (
  CHIRPSTACK_DEVICE_SYNC_ENABLED &&
  (!CHIRPSTACK_GRPC_ADDRESS ||
    !CHIRPSTACK_API_TOKEN ||
    !LORAWAN_CATALOG_INTERNAL_TOKEN)
) {
  throw new Error(
    'ChirpStack device sync esta habilitado pero faltan direccion, token ChirpStack o token interno de catalogo.',
  );
}
