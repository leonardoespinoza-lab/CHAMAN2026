export type TSensor =
  | 'Solar radiation' // Radiación solar
  | 'Soil temperature' // Temperatura del suelo
  | 'Solar Panel' // Panel solar
  | 'Precipitation' // Lluvia
  | 'Battery' // Batería
  | 'HC Serial Number'
  | 'HC Air temperature' // Temperatura del aire
  | 'HC Relative humidity' // Humedad relativa
  | 'Dew Point' // Punto de rocío
  | 'VPD'
  | 'DeltaT'
  | 'U-sonic wind speed' // Velocidad de viento
  | 'U-sonic wind dir' // Dirección de viento
  | 'Wind gust' // Ráfaga de viento
  | 'Sensor board battery'
  | 'Input number'
  | 'Soil media'
  | 'PI54a (VWC)'
  | 'Wind direction' // Dirección de viento
  | 'Wind speed' // Velocidad de viento
  | 'I2C Temperature' // Temperatura
  | 'Relative humidity' // Humedad relativa
  | 'I2C Rel Humidity' // Humedad relativa
  | 'EAG Soil moisture' // Humedad de suelo
  | 'Air temperature, high precision' // Temperatura del aire
  | 'Soil temperature 1' // Temperatura del suelo nivel 1
  | 'Soil temperature 2' // Temperatura del suelo nivel 2
  | 'Soil temperature 3' // Temperatura del suelo nivel 3
  | 'Soil temperature 4' // Temperatura del suelo nivel 4
  | 'Soil temperature 5' // Temperatura del suelo nivel 5
  | 'Soil temperature 6' // Temperatura del suelo nivel 6
  | 'Soil temperature 7' // Temperatura del suelo nivel 7
  | 'Soil temperature 8' // Temperatura del suelo nivel 8
  | 'Soil temperature 9' // Temperatura del suelo nivel 9
  | 'EAG Soil moisture 1' // Humedad de suelo nivel 1
  | 'EAG Soil moisture 2' // Humedad de suelo nivel 2
  | 'EAG Soil moisture 3' // Humedad de suelo nivel 3
  | 'EAG Soil moisture 4' // Humedad de suelo nivel 4
  | 'EAG Soil moisture 5' // Humedad de suelo nivel 5
  | 'EAG Soil moisture 6' // Humedad de suelo nivel 6
  | 'EAG Soil moisture 7' // Humedad de suelo nivel 7
  | 'EAG Soil moisture 8' // Humedad de suelo nivel 8
  | 'EAG Soil moisture 9' // Humedad de suelo nivel 9
  | 'Pressure Switch'
  | 'Wind gust'; // Ráfaga de viento

export interface IStationSensor {
  name: TSensor; // "Solar radiation";
  name_custom: string; // "";
  color: string; // "#ffff99";
  decimals: number; // 0;
  divider: number; // 1;
  multiplier: number; // 1;
  size: string; // "16b";
  unit: string; // "W/m2";
  unit_default: string; // "W/m2";
  calibration_id: string; // "";
  is_user_set: {
    name: boolean; // false;
    unit: boolean; // false;
    color: boolean; // false
  };
  units: string[]; // ["W/m2", "J/m2", "kJ/m2", "MJ/m2"];
  ch: number; // 0;
  code: number; // 600;
  group: number; // 4;
  mac: string; // 'X';
  serial: string; // 'X';
  vals: {
    min: number; // 0;
    max: number; // 32767;
  };
  aggr: string[]; // ['avg'];
  registered: string; // '2022-06-29 13:10:15';
  isActive: boolean; // true;
  desc: string; // '';
}
