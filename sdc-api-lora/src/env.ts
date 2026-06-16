// Port
export const PORT = +process.env.PORT || 5012;
// Env
export type Envs = 'local' | 'dev' | 'test' | 'production';
export const ENV: Envs = (process.env.ENV as Envs) || 'local';
export const PREFIX = process.env.PREFIX || '';
export const DEBUG =
  process.env.DEBUG === 'true' ? true : ENV === 'local' ? true : false;
// APIS
export const API_DATOS =
  process.env.API_DATOS || 'http://localhost:5000';

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
