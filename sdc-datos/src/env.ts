import { MongooseModuleOptions } from '@nestjs/mongoose';

export const VERSION = '1.0.0';
export const PORT = process.env.PORT || 5000;
export type Envs = 'local' | 'dev' | 'test' | 'production';
export const ENV: Envs = (process.env.ENV as Envs) || 'local';
export const PREFIX_PATH = process.env.PREFIX_PATH || '';

// Database
const DB_FULL_URI =
  process.env.MONGO_URI || process.env.MONGO_URL || process.env.DATABASE_URL;
export const DB_HOST = process.env.DB_HOST || 'localhost';
export const DB_PORT = process.env.DB_PORT || '27017';
export const DB_NAME = process.env.DB_NAME || 'chaman';
export const DB_USER = process.env.DB_USER || '';
export const DB_PASS = process.env.DB_PASS || '';

export const DB_URL = DB_FULL_URI || `mongodb://${DB_HOST}:${DB_PORT}`;
export const AGROMETEO_INTERNAL_TOKEN =
  process.env.AGROMETEO_INTERNAL_TOKEN || '';

// Solo incluir autenticación si hay usuario Y contraseña no vacíos
const authOptions =
  DB_USER && DB_PASS && DB_USER !== '' && DB_PASS !== ''
    ? { user: DB_USER, pass: DB_PASS }
    : {};

export const DB_OPTIONS: MongooseModuleOptions = {
  ...authOptions,
  ...(DB_FULL_URI && !process.env.DB_NAME ? {} : { dbName: DB_NAME }),
  directConnection: ENV === 'local' && !DB_FULL_URI ? true : false,
};
