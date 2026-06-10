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
export const API_DATOS =
  process.env.API_DATOS || 'http://127.0.0.1:5000';
export const API_CLIMA =
  process.env.API_CLIMA || 'http://127.0.0.1:5008/local';
// MAIL
export const MAIL_HOST = process.env.MAIL_HOST;
export const MAIL_PORT = +process.env.MAIL_PORT;
export const MAIL_USER = process.env.MAIL_USER;
export const MAIL_PASS = process.env.MAIL_PASS;
