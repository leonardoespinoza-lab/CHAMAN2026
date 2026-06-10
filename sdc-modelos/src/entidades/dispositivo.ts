import { IGeoJSONPoint } from '../compartidos';
import { IDistribuidor } from './distribuidor';
import { Sensores } from './estacion';
import { IProductor } from './productor';
import { IQuimica } from './quimica';
import { IReporte, SensoresV2 } from './reporte';

export interface IMetaDataLora {
  ubicacionGW?: IGeoJSONPoint;
  snr?: number; // Signal to Noise Ratio
  rssi?: number; // Received Signal Strength Indicator
  dr?: number; // Data Rate
}

export interface IBateria {
  valor?: number;
  unidad?: string;
  fecha?: string; // Fecha de la medición
}

export type TipoDispositivo =
  | 'Estación Meteorológica'
  | 'Sensor de Humedad de Suelo'
  | 'Pluviómetro'
  | 'Otro';

export interface IDispositivo {
  _id?: string;
  fechaCreacion?: string;
  //
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  //
  deveui?: string;
  tipo?: TipoDispositivo;
  metadata?: IMetaDataLora;
  /**
   * Sensores que tiene la estación - Cambia según el origen
   */
  sensores?: SensoresV2[]; // ["temperatura", "humedad", "viento", "radiacion"]
  // Datos de Carga
  geojson?: IGeoJSONPoint;
  nombre?: string;
  // Reportes
  bateria?: IBateria;
  ultimoReporte?: IReporte;
  fechaUltimaComunicacion?: string; // Puede ser de otra copsa que no sea un reporte.

  // Populate
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
}

type Omitir = '_id';
export interface ICreateDispositivo
  extends Omit<Partial<IDispositivo>, Omitir> {}

export interface IUpdateDispositivo
  extends Omit<Partial<IDispositivo>, Omitir> {}
