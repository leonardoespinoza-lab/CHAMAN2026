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
