import { ICreateLorawanUplink, IDispositivo } from 'modelos/src';
import {
  IControllerDecodeResult,
  IControllerPayloadDecoder,
} from './controller-decoder';
import { MilesightUc50xControllerDecoder } from './milesight-uc50x.controller-decoder';

export class ControllerDecoderRegistry {
  constructor(private readonly decoders: readonly IControllerPayloadDecoder[]) {
    const ids = decoders.map((decoder) => decoder.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error('Cada decoder de controlador debe tener un id unico.');
    }
  }

  decode(
    uplink: ICreateLorawanUplink,
    dispositivo?: IDispositivo,
  ): IControllerDecodeResult | null {
    for (const decoder of this.decoders) {
      const result = decoder.decode(uplink, dispositivo);
      if (result) return result;
    }
    return null;
  }

  catalog(): Array<{
    id: string;
    version: string;
    manufacturer: string;
    models: readonly string[];
  }> {
    return this.decoders.map(({ id, version, manufacturer, models }) => ({
      id,
      version,
      manufacturer,
      models,
    }));
  }
}

export const controllerDecoderRegistry = new ControllerDecoderRegistry([
  new MilesightUc50xControllerDecoder(),
]);

export function decodeControllerUplink(
  uplink: ICreateLorawanUplink,
  dispositivo?: IDispositivo,
): IControllerDecodeResult | null {
  return controllerDecoderRegistry.decode(uplink, dispositivo);
}
