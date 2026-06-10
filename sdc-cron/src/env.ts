// Port
export const PORT = +process.env.PORT || 5004;
// Env
export type Envs = 'local' | 'dev' | 'test' | 'production';
export const ENV: Envs = (process.env.ENV as Envs) || 'local';
export const PREFIX_PATH =
  ENV === 'production'
    ? 'sdc-cron'
    : ENV === 'test'
      ? 'sdc-cron-test'
      : ENV === 'dev'
        ? 'sdc-cron-dev'
        : '';
// APIS
export const API_DATOS =
  process.env.API_DATOS || 'http://localhost:5000';
export const DEBUG =
  process.env.DEBUG === 'true' ? true : ENV === 'local' ? true : false;
// REDIS
export const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
export const REDIS_PORT = process.env.REDIS_PORT || '6379';
export const REDIS_DB = ENV === 'production' ? 0 : ENV === 'test' ? 1 : 2;
export const REDIS_NAMESPACE = `redis-${ENV}`;
export const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
export const REDIS_PRIFIX = process.env.REDIS_PRIFIX || '';

// CRON DESPACHOS
export const TAREAS_TEST = process.env.TAREAS_TEST === 'true' ? true : false;
