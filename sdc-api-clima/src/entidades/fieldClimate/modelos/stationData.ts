import { TSensor } from './stationSensor';

export type TCalculation = 'Wind orientation' | 'Midnight';
export type TDisease = 'Daily ET0' | 'ET0';

export type TDataName = TSensor | TCalculation | TDisease;

export type TType = 'Sensor' | 'Calculation' | 'Disease';

export interface TDataReporte {
  name: TDataName; // "Solar radiation",
  name_original: string; // "Solar radiation",
  type: TType; // "Sensor",
  decimals: number; // 0,
  unit: string; // "W/m2",
  ch: number; // 0,
  code: number; // 600,
  group: number; // 4,
  serial: string; // "x",
  mac: string; // "x",
  registered: string; // "2022-05-12 12:40:16",
  vals: object;
  aggr: string[]; // ["avg"],
  values: {
    avg: number[]; // [392, 389, 371, 427, 429, 462, 485, 478, 495, ...]
    sum: number[];
    min: number[];
    max: number[];
    count: number[];
    last: number[];
    result: number[];
  };
}

export interface IStationData {
  dates: string[]; // ["2022-06-29 10:40:00", "2022-06-29 10:50:00"]
  data: TDataReporte[];
}
