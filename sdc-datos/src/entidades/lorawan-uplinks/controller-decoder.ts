import {
  ICreateLorawanUplink,
  IDispositivo,
  ILorawanRawReading,
  IValoresV2,
} from 'modelos/src';

/**
 * Contrato estable para incorporar controladores LoRaWAN sin acoplar su
 * payload al servicio de ingesta. Cada decoder debe preservar la evidencia
 * cruda y devolver solamente magnitudes que puede demostrar.
 */
export interface IControllerPayloadDecoder {
  readonly id: string;
  readonly version: string;
  readonly manufacturer: string;
  readonly models: readonly string[];
  decode(
    uplink: ICreateLorawanUplink,
    dispositivo?: IDispositivo,
  ): IControllerDecodeResult | null;
}

export interface IControllerDecodeResult {
  decoderId: string;
  decoderVersion: string;
  manufacturer: string;
  model: string;
  payloadHex?: string;
  valores: IValoresV2['valores'];
  readings: ILorawanRawReading[];
  /** Canales parciales que pertenecen al mismo barrido del controlador. */
  cycleChannels: number[];
  capabilities: {
    soilProfile: boolean;
    analogInput: boolean;
  };
}
