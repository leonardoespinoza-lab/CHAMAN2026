export interface ILorawanUplink {
  _id?: string;
  fechaCreacion?: string;
  topic?: string;
  applicationID?: string;
  applicationName?: string;
  devEUI?: string;
  deviceName?: string;
  fCnt?: number;
  fPort?: number;
  data?: string;
  gatewayID?: string;
  rssi?: number;
  snr?: number;
  frequency?: number;
  dr?: number;
  timestamp?: string;
  rawPayload?: Record<string, any>;
}

export type LorawanRawVariable =
  | "humedad_suelo"
  | "salinidad_suelo"
  | "temperatura_suelo"
  | "corriente_analogica"
  | "nivel_napa"
  | "presion_agua";

/** Una medicion tal como fue recibida en una trama, sin promedios de Chaman. */
export interface ILorawanRawReading {
  serviceId: "perfil-suelo-sentek" | "nivel-napa";
  variable: LorawanRawVariable;
  value: number;
  unit: string;
  depthCm?: number;
  channel?: number;
  rawValue?: number;
  rawUnit?: string;
  /** En nivel_napa, distancia vertical terreno-superficie del agua. */
  reference?: "nivel_terreno";
  /** Columna hidrostatica medida sobre el transductor. */
  waterColumnM?: number;
  /** Profundidad vertical del diafragma desde el terreno. */
  installationDepthM?: number;
  conversionModel?: "lineal-4-20ma-v1";
}

/** Evidencia auditable de un uplink fisico y sus lecturas decodificadas. */
export interface ILorawanRawFrame {
  id?: string;
  devEUI: string;
  timestamp: string;
  fCnt?: number;
  fPort?: number;
  gatewayID?: string;
  rssi?: number;
  snr?: number;
  frequency?: number;
  dr?: number;
  payloadHex?: string;
  payloadBase64?: string;
  decodeStatus: "decoded" | "unrecognized";
  readings: ILorawanRawReading[];
}

type Omitir = "_id";
export interface ICreateLorawanUplink extends Omit<
  Partial<ILorawanUplink>,
  Omitir
> {}

export interface IUpdateLorawanUplink extends Omit<
  Partial<ILorawanUplink>,
  Omitir
> {}
