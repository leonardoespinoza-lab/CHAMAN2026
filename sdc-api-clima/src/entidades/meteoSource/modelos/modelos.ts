import { WeatherVariable } from 'modelos/src';

export interface IForecastMeteoSource {
  lat: string;
  lon: string;
  elevation: number;
  timezone: string;
  unit: string;
  hourly: DataHourly;
  daily: DataDaily;
  current: DataCurrent;
}

export interface ITimeMachineMeteoSource {
  lat: string;
  lon: string;
  elevation: number;
  timezone: string;
  units: string;
  data: DataPoint[];
  daily: Daily;
  statistics: Statistics;
}

export interface DataPoint {
  date: string;
  weather: string;
  summary: string;
  icon: number;
  temperature: number;
  feels_like: number;
  wind_chill: number;
  soil_temperature: number;
  dew_point: number;
  surface_temperature: number;
  wind: Wind;
  cloud_cover: CloudCover;
  pressure: number;
  precipitation: Precipitation;
  cape: number;
  evaporation: number;
  irradiance: number;
  ozone: number;
  humidity: number;
}

export interface Daily {
  temperature: number;
  temperature_min: number;
  temperature_max: number;
  feels_like: number;
  feels_like_min: number;
  feels_like_max: number;
  wind_chill: number;
  wind_chill_min: number;
  wind_chill_max: number;
  soil_temperature: number;
  soil_temperature_min: number;
  soil_temperature_max: number;
  dew_point: number;
  dew_point_min: number;
  dew_point_max: number;
  surface_temperature: number;
  surface_temperature_min: number;
  surface_temperature_max: number;
  wind: DailyWind;
  cloud_cover: DailyCloudCover;
  pressure: number;
  precipitation: Precipitation;
  humidity: number;
}

export interface DailyWind {
  speed: number;
  gusts: number;
  dir: string;
  angle: number;
}

export interface DailyCloudCover {
  total: number;
  low: number;
  middle: number;
  high: number;
}

export interface DataHourly {
  data: ListHourly[];
}

export interface DataDaily {
  data: ListDaily[];
}

export interface DataCurrent {
  icon?: string;
  icon_num?: number;
  summary?: string;
  temperature?: number;
  feels_like?: number;
  soil_temperature?: number;
  surface_temperature?: number;
  wind_chill?: number;
  dew_point?: number;
  wind?: Wind;
  precipitation?: Precipitation;
  probability?: Probability;
  cloud_cover?: number;
  cape?: number;
  evaporation?: number;
  irradiance?: number;
  lftx?: number;
  ozone?: number;
  pressure?: number;
  uv_index?: number;
  humidity?: number;
  snow_depth?: number;
  sunshine_duration?: number;
  visibility?: number;
}

export interface ListHourly {
  date: string; //"2024-12-16T19:00:00"
  temperature: number;
  soil_temperature: number;
  surface_temperature: number;
  wind: Wind;
  pressure: number;
  precipitation: Precipitation;
  probability: Probability;
  cape: number;
  evaporation: number;
  irradiance: number;
  uv_index: number;
  humidity: number;
}

export interface ListDaily {
  day: string; //"2024-12-16"
  weather: string;
  icon: number;
  summary: string;
  predictability: number;
  all_day: AllDay;
  statistics: Statistics;
}

export interface Wind {
  speed: number;
  gusts: number;
  dir: string;
  angle: number;
}

export interface CloudCover {
  total: number;
  low: number;
  middle: number;
  high: number;
}

export interface Precipitation {
  total: number;
  type: string;
  convective: number;
  rainspot: string;
}

export interface Probability {
  precipitation: number;
  storm: number;
  freeze: number;
}

export interface AllDay {
  temperature: number;
  temperature_min: number;
  temperature_max: number;
  soil_temperature: number;
  soil_temperature_min: number;
  soil_temperature_max: number;
  pressure: number;
  humidity: number;
}

export interface Statistics {
  temperature: StatPrecipitation;
  wind: StatWind;
  precipitation: StatPrecipitation;
}

export interface StatTemperature {
  avg: number;
  avg_min: number;
  avg_max: number;
  record_min: number;
  record_max: number;
}

export interface StatWind {
  avg_speed: number;
  avg_angle: number;
  avg_dir: 'E';
  max_speed: number;
  max_gust: number;
}

export interface StatPrecipitation {
  avg: number;
  probability: number;
}

// Interfaces para Weather Maps / Tiles
export interface ITileRequest {
  variable: WeatherVariable;
  datetime: string;
  x: string;
  y: string;
  z: string;
}
