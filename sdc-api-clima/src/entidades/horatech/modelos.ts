import { ICoordenadas } from 'modelos/src';
// Respuesta de Horatech
// {
//   "datos": [
//     {
//       "nombre": "string",
//       "deveui": "string",
//       "deviceName": "string",
//       "tipo": "Estacion Meteorologica",
//       "fechaUltimaComunicacion": "string",
//       "ubicacion": {
//         "lat": 0,
//         "lng": 0
//       },
//       "ultimoReporte": {
//         "fecha": "string",
//         "deviceName": "string",
//         "deveui": "string",
//         "tipoDispositivo": "string",
//         "reporte": {}
//       }
//     }
//   ],
//   "totalCount": 0
// }
export interface IDispositivoHoratech {
  nombre?: string;
  deveui: string;
  deviceName?: string;
  tipo?: TipoDispositivo;
  fechaUltimaComunicacion?: string;
  ubicacion?: ICoordenadas | null;
  // Info especifica de cada tipo de dispositivo
  ultimoReporte?: IReporteHoratech;
}

/// Respusta Horatech
// {
//   "datos": [
//     {
//       "fecha": "string",
//       "deviceName": "string",
//       "deveui": "string",
//       "tipoDispositivo": "string",
//       "reporte": {}
//     }
//   ],
//   "totalCount": 0
// }

export interface IReporteHoratech {
  // Datos Autogenerados
  fecha?: string;
  deviceName?: string;
  deveui?: string;
  tipoDispositivo?: TipoDispositivo;
  // Datos especificos de la alerta de acuerdo al tipo de dispositivo
  reporte?: Record<string, any>;
}

export type TipoDispositivo =
  | 'Estacion Meteorologica'
  | 'Freatimetro'
  | 'Lanza de Humedad'
  | 'Pluviometro'
  | 'Sensor Humedad de Suelo';

export const TIPOS_DISPOSITIVOS: TipoDispositivo[] = [
  'Estacion Meteorologica',
  'Freatimetro',
  'Lanza de Humedad',
  'Pluviometro',
  'Sensor Humedad de Suelo',
];
