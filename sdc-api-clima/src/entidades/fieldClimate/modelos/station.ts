export type StationMetaKeys =
  | 'solarRadiation'
  | 'soilTemp'
  | 'solarPanel'
  | 'battery'
  | 'airTemp'
  | 'rh'
  | 'rain7d'
  | 'rain48h'
  | 'rain24h'
  | 'volumetricAverage';

export interface IStation {
  name: {
    original: string; // "0020B01B"
    custom: string; // "Manexa"
  };
  rights: string; // "rw"
  info: {
    device_id: number; // 7
    device_name: string; // "iMetos 3.3";
    uid: string; // "249BC3085B7767E8";
    firmware: string; // "08.521.20200329";
    hardware: string; // "29-0503";
    programmed: string; // "";
    apn_table: number; // 3;
    description: string; // "iMetos 3.3; hw: 29-0503; fw: 08.521.20200329"
  };
  dates: {
    min_date: string; // "2020-08-21 07:29:06";
    max_date: string; // "2022-06-30 10:00:16";
    created_at: string; // "2020-08-21 06:55:22";
    last_communication: string; // "2022-06-30 10:01:03"
  };
  config: {
    scheduler: number; // 16777215;
    timezone_offset: number; // -180;
    precision_reduction: number; // 0.2;
    measuring_interval: number; // 5;
    logging_interval: number; // 10;
    activity_mode: number; // 0;
    fixed_transfer_interval: number; // 60;
    x_min_transfer_interval: number; // 0;
    rain_monitor: number; // 0;
    water_level_monitor: number; // 0;
    schedulerOld: string; // "FFFFFF000000000000000000000000000000000000000000"
  };
  position: {
    geo: {
      type: string; // "Point";
      coordinates: [number, number]; // [-60.634811, -34.209442]
    };
    altitude: number; // 75.4;
    hdop: number; // 0.7;
    measure_time: number; // 0;
    timezoneCode: string; // "America/Argentina/Buenos_Aires"
  };
  sharing_keys: string[]; // ["5d9ced34-7d28-4be6-a879-5780d55d85a9", "ad9d63b4-78c3-4dd1-a3f9-6c752ec48ee6"]
  meta: {
    time: number; // 1656583200;
    solarRadiation: number; // 270;
    soilTemp: number; // 6.8;
    solarPanel: number; // 10237;
    battery: number; // 6787;
    airTemp: number; // 7.8;
    rh: number; // 99.99;
    rain7d: {
      vals: number[]; // [0, 0, 0, 0, 0, 0, 0]
      sum: number; // 0
    };
    rain48h: {
      vals: number[]; // [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      sum: number; // 0
    };
    rain24h: {
      vals: number[]; // [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      sum: number; // 0
    };
    volumetricAverage: number; // 0;
  };
  metaUnits: string; // 'metric';
  networking: {
    type: string; // 'UMTS';
    mcc: string; // '722';
    mnc: string; // '07';
    mcc_sim: string; // '722';
    mnc_sim: string; // '071';
    country: string; // 'Movistar Arg';
    apn: string; // 'wap.gprs.unifon.com.ar';
    usernme: string; // 'wap';
    password: string; // '';
    simid: string; // '8954076144600475334';
    rssi_pct: string; // '54';
    imei: string; // '014114000204514';
    modem: {
      brand: string; // 'Sierra Wireless';
      type: string; // 'SL8080TR Product';
      fwversion: string; // 'R7.53.1.A1.201504291449.SL8080TR 1962308 042915 14:49';
      sn: string; // 'CHN1786184540';
    };
    provider: string; // 'N/A';
    provider_sim: string; // 'N/A';
  };
  warnings: {
    sensors: [];
    sms_numbers: [];
  };
  licenses:
    | boolean // false
    | {
        AnimalProduction: boolean; // false;
        Forecast: boolean; // false;
        models: [];
      };

  // CAMPOS AGREGADOS
  distancia?: number;
}
