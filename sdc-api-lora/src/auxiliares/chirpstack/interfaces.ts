// Interfaces para los objetos anidados
export type Event = 'up' | 'status' | 'join' | 'ack';
export interface Location {
  latitude: number;
  longitude: number;
}

export interface DeviceInfo {
  tenantId: string;
  tenantName: string;
  applicationId: string;
  applicationName: string;
  deviceProfileId: string;
  deviceProfileName: string;
  deviceName: string;
  devEui: string;
  deviceClassEnabled?: string; // Es opcional, aparece en el segundo ejemplo
  tags: {
    [key: string]: string;
  };
}

export interface RxInfo {
  gatewayId: string;
  uplinkId: number;
  rssi: number;
  snr: number;
  context: string;
  gwTime?: string; // Opcional
  nsTime?: string; // Opcional
  timeSinceGpsEpoch?: string; // Opcional
  location?: Location; // Opcional
  crcStatus?: string; // Opcional
  metadata?: {
    // Opcional, aparece en el primer ejemplo
    region_name: string;
    region_common_name: string;
  };
}

export interface LoraModulation {
  bandwidth: number;
  spreadingFactor: number;
  codeRate: string;
}

export interface Modulation {
  lora: LoraModulation;
}

export interface TxInfo {
  frequency: number;
  modulation: Modulation;
}

export interface Uplink {
  deduplicationId: string;
  time: string;
  deviceInfo: DeviceInfo;
  devAddr: string;
  adr?: boolean; // Opcional
  dr: number;
  fCnt?: number; // Opcional
  fPort: number;
  confirmed?: boolean; // Opcional
  data: string;
  object?: {
    // Opcional
    [key: string]: string;
  };
  rxInfo: RxInfo[];
  txInfo: TxInfo;
  regionConfigId?: string; // Opcional
  margin?: number;
  externalPowerSource?: boolean;
  batteryLevelUnavailable?: boolean;
  batteryLevel?: number; // El campo clave para la batería en %
}
