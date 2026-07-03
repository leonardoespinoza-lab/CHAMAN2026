// Port
export const PORT = +process.env.PORT || 5008;
// Env
export type Envs = 'local' | 'dev' | 'test' | 'production';
export const ENV: Envs = (process.env.ENV as Envs) || 'local';
const PREFIX = process.env.PREFIX || 'clima';
export const PREFIX_PATH =
  ENV === 'production'
    ? PREFIX
    : ENV === 'test'
      ? `${PREFIX}-test`
      : ENV === 'dev'
        ? `${PREFIX}-dev`
        : 'local';
export const DEBUG =
  process.env.DEBUG === 'true' ? true : ENV === 'local' ? true : false;
// APIS
export const API_DATOS =
  process.env.API_DATOS || 'http://127.0.0.1:5000';
// Field Climate
export const API_FIELD_CLIMATE =
  process.env.API_FIELD_CLIMATE || 'https://api.fieldclimate.com/v2';
export const PUBLIC_KEY = process.env.PUBLIC_KEY || '';
export const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

export const FIELD_CLIMATE_USERS: string[] = JSON.parse(
  process.env.FIELD_CLIMATE_USERS || '[]',
);
export const FIELD_CLIMATE_PASS: string[] = JSON.parse(
  process.env.FIELD_CLIMATE_PASS || '[]',
);

// Open Weather
export const API_OPEN_WEATHER =
  process.env.API_WEATHER_BIT || 'https://api.openweathermap.org/data/2.5';
export const OPEN_WEATHER_KEY = process.env.OPEN_WEATHER_KEY || '';

export const API_OPEN_METEO =
  process.env.API_OPEN_METEO || 'https://api.open-meteo.com/v1';
export const API_OPEN_METEO_ARCHIVE =
  process.env.API_OPEN_METEO_ARCHIVE || 'https://archive-api.open-meteo.com/v1';

export const API_METEO_SOURCE =
  process.env.API_METEO_SOURCE || 'https://www.meteosource.com/api/v1';
export const METEO_SOURCE_KEY = process.env.METEO_SOURCE_KEY || '';

export const API_METEOBLUE =
  process.env.API_METEOBLUE || 'https://my.meteoblue.com/packages';
export const METEOBLUE_API_KEY = process.env.METEOBLUE_API_KEY || '';
export const METEOBLUE_DAILY_PACKAGE =
  process.env.METEOBLUE_DAILY_PACKAGE || 'basic-day';
export const METEOBLUE_HOURLY_PACKAGE =
  process.env.METEOBLUE_HOURLY_PACKAGE || 'basic-1h';

export const API_OMIXON =
  process.env.API_OMIXON || 'https://new.omixom.com/api/v2';
export const OMIXON_KEY = process.env.OMIXON_KEY || '';

export const API_HORATECH =
  process.env.API_HORATECH ||
  'https://apis.horatech.com.ar/agro-v2-cliente-test/apiIntegraciones';
export const API_HORATECH_APIKEY = process.env.API_HORATECH_APIKEY || '';

// Clima
export const DISTANCIA_EXCELENTE = +process.env.DISTANCIA_EXCELENTE || 30;
export const DISTANCIA_BUENA = +process.env.DISTANCIA_BUENA || 50;
export const DISTANCIA_MALA = +process.env.DISTANCIA_MALA || 100;

// TEST
export const CRON_TEST =
  process.env.CRON_TEST === 'true' ? true : false || false;

// vuz3mvthpubz0aophqk762tkggo22tke1c12wy9m

// https://www.meteosource.com/api/v1/free/point?lat=-35.56881685355293&lon=-58.01234247508361&sections=all&timezone=UTC&language=en&units=metric&key=vuz3mvthpubz0aophqk762tkggo22tke1c12wy9m
// https://new.omixom.com/api/v2/stations
