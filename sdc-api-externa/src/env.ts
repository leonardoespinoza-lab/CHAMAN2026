// Port
export const PORT = +process.env.PORT || 5002;
// Env
export type Envs = 'local' | 'dev' | 'test' | 'production';
export const ENV: Envs = (process.env.ENV as Envs) || 'local';
export const PREFIX = process.env.PREFIX || '';
export const DEBUG =
  process.env.DEBUG === 'true' ? true : ENV === 'local' ? true : false;
// APIS
export const API_DATOS =
  process.env.API_DATOS || 'http://localhost:5000';

export const API_PREDICCIONES =
  process.env.API_PREDICCIONES || 'http://localhost:5007';
export const API_CLIMA =
  process.env.API_CLIMA || 'http://localhost:5008/local';
