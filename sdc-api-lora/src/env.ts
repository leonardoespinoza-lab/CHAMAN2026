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
