export type TCalculation =
  | 'ET0'
  | 'Midnight'
  | 'Snow amount'
  | 'Wind orientation';
export type TForecast =
  | 'Global radiation - Sensible Heat Flux'
  | 'Leaf Wetness'
  | 'Pictocode'
  | 'Precipitation'
  | 'Probability of Prec.'
  | 'Probability of snow'
  | 'relativehumidity_max'
  | 'relativehumidity_min'
  | 'relativehumidity_mean'
  | 'temperature_max'
  | 'temperature_min'
  | 'temperature_mean'
  | 'Wind direction'
  | 'windspeed_max'
  | 'windspeed_min'
  | 'windspeed_mean';

export type TDataName = TForecast | TCalculation;

export type TType = 'Forecast' | 'Calculation';

export interface TDataForecast {
  name: TDataName;
  type: TType;
  unit: string;
  values: {
    result: number[];
  };
}

export interface IForecast {
  dates: string[]; // ["2022-06-29 10:40:00", "2022-06-29 10:50:00"]
  data: TDataForecast[];
}
