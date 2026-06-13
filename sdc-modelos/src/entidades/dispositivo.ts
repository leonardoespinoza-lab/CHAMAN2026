import { IGeoJSONPoint } from '../compartidos';
import { IDistribuidor } from './distribuidor';
import { IProductor } from './productor';
import { IQuimica } from './quimica';
import { IReporte, SensoresV2 } from './reporte';
import type { IEstablecimiento } from './establecimiento';
import type { ILote } from './lote';

export interface IMetaDataLora {
  ubicacionGW?: IGeoJSONPoint;
  applicationID?: string;
  applicationName?: string;
  gatewayID?: string;
  frequency?: number;
  fCnt?: number;
  fPort?: number;
  snr?: number;
  rssi?: number;
  dr?: number;
}

export interface IBateria {
  valor?: number;
  unidad?: string;
  fecha?: string;
}

export interface IFrioAcumulado {
  fechaInicio?: string;
  fechaUltimoCalculo?: string;
  ultimaTemperatura?: number;
  horasFrio?: number;
  horasFrioEfectivas?: number;
  factorEfectivoActual?: number;
  modelo?: 'HF <= 7C + HFE Utah simplificado';
  fuente?: 'Sensor LoRa';
}

export type TipoDispositivo =
  | 'Estación Meteorológica'
  | 'Estacion Meteorologica'
  | 'Sensor de Humedad de Suelo'
  | 'Pluviómetro'
  | 'Pluviometro'
  | 'Otro';

export interface IDispositivo {
  _id?: string;
  fechaCreacion?: string;
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  idEstablecimiento?: string;
  idLote?: string;
  deveui?: string;
  tipo?: TipoDispositivo;
  metadata?: IMetaDataLora;
  sensores?: SensoresV2[];
  geojson?: IGeoJSONPoint;
  nombre?: string;
  bateria?: IBateria;
  ultimoReporte?: IReporte;
  frioAcumulado?: IFrioAcumulado;
  fechaUltimaComunicacion?: string;
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
  lote?: ILote;
}

type Omitir = '_id';
export interface ICreateDispositivo
  extends Omit<Partial<IDispositivo>, Omitir> {}

export interface IUpdateDispositivo
  extends Omit<Partial<IDispositivo>, Omitir> {}
