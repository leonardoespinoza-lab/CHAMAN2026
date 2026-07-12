// Port
export const PORT = +process.env.PORT || 5001;
// Env
export type Envs = 'local' | 'dev' | 'test' | 'production';
export const ENV: Envs = (process.env.ENV as Envs) || 'local';
const PREFIX = process.env.PREFIX || 'sdc-auth';
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
// DATOS INICIALES
export const CLIENT_ID_INICIAL =
  process.env.CLIENT_ID_INICIAL || (ENV === 'production' ? '' : '1');
export const CLIENT_SECRET_INICIAL =
  process.env.CLIENT_SECRET_INICIAL || (ENV === 'production' ? '' : '1');
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || '';

export const PASSWORD_DEFAULT_GOOGLE =
  process.env.PASSWORD_DEFAULT_GOOGLE || 'local-google-login-disabled';
