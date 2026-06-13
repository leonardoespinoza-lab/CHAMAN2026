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

type Omitir = '_id';
export interface ICreateLorawanUplink
  extends Omit<Partial<ILorawanUplink>, Omitir> {}

export interface IUpdateLorawanUplink
  extends Omit<Partial<ILorawanUplink>, Omitir> {}
