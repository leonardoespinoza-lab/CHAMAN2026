import { IDispositivo, IMetaDataLora } from './dispositivo';

export type SensoresV2 =
  | 'Temperatura'
  | 'Temperatura Suelo'
  | 'Humedad'
  | 'Humedad Suelo Superficial' // SHS Pinche ahí nomás
  | 'Humedad Suelo Profundidad' // LANZA Muchos valores
  | 'Viento Velocidad'
  | 'Viento Dirección'
  | 'Pluviometro' // Lluvia en general
  | 'Presión'
  | 'Evapotranspiración'
  | 'Radiación Solar'
  | 'Napa' // Freatimetro
  | 'Batería'
  | 'Otro'; // Sensores que no sé que son

export interface IValoresV2 {
  valores: {
    [K in SensoresV2]?: {
      profundidad?: number;
      unidad?: string;
      valores?: {
        promedio?: number;
        suma?: number;
        min?: number;
        max?: number;
        cantidad?: number;
        actual?: number;
        acumulado?: number;
      };
    }[];
  };
}

export interface IReporte {
  _id?: string;
  idDispositivo?: string;
  deveui?: string;
  fechaCreacion?: string; // Cuando me llega
  fecha?: string; // Fecha del reporte
  estado?: 'parcial' | 'completo'; // Para los partidos como la lanza de 12
  datos?: IValoresV2;
  metadataLora?: IMetaDataLora;

  // Populate
  dispositivo?: IDispositivo;
}

type Omitir = '_id';
export interface ICreateReporte extends Omit<Partial<IReporte>, Omitir> {}
export interface IUpdateReporte extends Omit<Partial<IReporte>, Omitir> {}
