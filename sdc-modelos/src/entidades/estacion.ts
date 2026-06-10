import { Module } from './omixom';

export type Sensores =
  | 'temperatura'
  | 'temperatura_suelo'
  | 'humedad'
  | 'humedad_suelo_superficial' // SHS Pinche ahí nomás
  | 'humedad_suelo_profundidad' // LANZA Muchos valores
  | 'viento_velocidad'
  | 'viento_direccion'
  | 'pluviometro' // Lluvia en general
  | 'presion'
  | 'evapotranspiracion'
  | 'radiacion_solar'
  | 'napa' // Freatimetro
  | 'otro'; // Sensores que no sé que son

export interface IEstacion {
  _id?: string;
  origen?: 'FieldClimate' | 'Chaman' | 'Omixom' | 'Horatech';
  // id de field climate o Omixom
  idExterno?: string;
  user?: string;
  pass?: string;
  apikey?: string;
  //
  name?: {
    original: string; // "0020B01B"
    custom: string; // "Manexa"
  };
  info?: {
    device_id?: number; // 7
    device_name: string; // "iMetos 3.3";
    uid: string; // "249BC3085B7767E8";
    firmware: string; // "08.521.20200329";
    hardware: string; // "29-0503";
    programmed: string; // "";
    apn_table: number; // 3;
    description: string; // "iMetos 3.3; hw: 29-0503; fw: 08.521.20200329"
  };
  dates?: {
    min_date: string; // "2020-08-21 07:29:06";
    max_date: string; // "2022-06-30 10:00:16";
    created_at: string; // "2020-08-21 06:55:22";
    last_communication: string; // "2022-06-30 10:01:03"
  };
  position?: {
    geo: {
      type: string; // "Point";
      coordinates: [number, number]; // [-60.634811, -34.209442]
    };
    altitude: number; // 75.4;
    hdop: number; // 0.7;
    measure_time: number; // 0;
    timezoneCode: string; // "America/Argentina/Buenos_Aires"
  };
  /**
   * Sensores que tiene la estación - Cambia según el origen
   */
  sensores?: Sensores[]; // ["temperatura", "humedad", "viento", "radiacion"]
  /**
   * Modulos que tiene la estación - solo para Omixom
   * Está porque reportan con el id en lugar de un nombre legible.
   */
  modulos?: Module[];
}

type OmitirCreate = '_id';
export interface ICreateEstacion
  extends Omit<Partial<IEstacion>, OmitirCreate> {}

type OmitirUpdate = '_id';
export interface IUpdateEstacion
  extends Omit<Partial<IEstacion>, OmitirUpdate> {}
