import {
  ICreateLorawanUplink,
  IDispositivo,
  ILorawanRawReading,
  IValoresV2,
} from 'modelos/src';
import {
  IControllerDecodeResult,
  IControllerPayloadDecoder,
} from './controller-decoder';
import { decodeSentekUc501Payload } from './sentek-uc501.decoder';
import {
  decodeUc511SentekPayload,
  decodedUc511ToReporteValores,
  extractUc511PayloadHex,
} from './uc511-sentek.decoder';
import { validateControllerReading } from './sentek-reading-quality';

export const MILESIGHT_UC50X_DECODER_ID = 'milesight-uc501-uc511';
export const MILESIGHT_UC50X_DECODER_VERSION = '1.0.0';

/**
 * Decoder del controlador Milesight UC501/UC511 usado por Chaman.
 *
 * El controlador transporta dos buses independientes:
 * - bloques SDI-12 de la sonda Sentek;
 * - una entrada analógica 4-20 mA.
 *
 * La presencia de un bloque demuestra la capacidad. El nombre del equipo no
 * se usa para inventar sensores que no llegaron en el payload.
 */
export class MilesightUc50xControllerDecoder implements IControllerPayloadDecoder {
  readonly id = MILESIGHT_UC50X_DECODER_ID;
  readonly version = MILESIGHT_UC50X_DECODER_VERSION;
  readonly manufacturer = 'Milesight';
  readonly models = ['UC501', 'UC511'] as const;

  decode(
    uplink: ICreateLorawanUplink,
    dispositivo?: IDispositivo,
  ): IControllerDecodeResult | null {
    const payloadHex = extractUc511PayloadHex(uplink);
    const decoded = decodeUc511SentekPayload(payloadHex);

    if (decoded) {
      const valores = this.validatedValores(
        decodedUc511ToReporteValores(
          decoded,
          dispositivo?.configuracionLecturas?.entradaAnalogica,
        ),
      );
      const readings = this.rawReadings(decoded, valores, dispositivo);
      return {
        decoderId: this.id,
        decoderVersion: this.version,
        manufacturer: this.manufacturer,
        model: this.detectModel(uplink, dispositivo),
        payloadHex,
        valores,
        readings,
        cycleChannels: decoded.raw.blocks.map((block) => block.channel),
        capabilities: {
          soilProfile: decoded.raw.blocks.length > 0,
          analogInput: decoded.analog.rawMa !== null,
        },
      };
    }

    // Compatibilidad con la primera integración UC501. Conserva el mismo
    // contrato para que el servicio no dependa del formato particular.
    const legacy = decodeSentekUc501Payload(uplink.data);
    if (!legacy) return null;

    const legacyValores = this.validatedValores(legacy.valores);

    return {
      decoderId: this.id,
      decoderVersion: this.version,
      manufacturer: this.manufacturer,
      model: this.detectModel(uplink, dispositivo),
      payloadHex,
      valores: legacyValores,
      readings: this.readingsFromValores(legacy.valores),
      cycleChannels: legacy.canales,
      capabilities: { soilProfile: true, analogInput: false },
    };
  }

  private rawReadings(
    decoded: NonNullable<ReturnType<typeof decodeUc511SentekPayload>>,
    valores: IValoresV2['valores'],
    dispositivo?: IDispositivo,
  ): ILorawanRawReading[] {
    const readings: ILorawanRawReading[] = [];
    const pushSoil = (
      variable: 'humedad_suelo' | 'salinidad_suelo' | 'temperatura_suelo',
      unit: string,
      values: Record<string, number | undefined>,
    ) => {
      Object.entries(values).forEach(([depth, value]) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return;
        const quality = validateControllerReading(variable, value);
        readings.push({
          serviceId: 'perfil-suelo-sentek',
          variable,
          value,
          unit,
          depthCm: Number(depth.replace('cm', '')),
          quality: quality.quality,
          qualityReason: quality.reason,
          validationReference: quality.reference,
        });
      });
    };

    pushSoil('humedad_suelo', '%', decoded.soil.moisture);
    pushSoil('salinidad_suelo', 'VIC', decoded.soil.salinity);
    pushSoil('temperatura_suelo', 'C', decoded.soil.temperature);

    if (decoded.analog.rawMa === null) return readings;

    const analogQuality = validateControllerReading(
      'corriente_analogica',
      decoded.analog.rawMa,
    );
    readings.push({
      serviceId: 'entrada-analogica',
      variable: 'corriente_analogica',
      value: decoded.analog.rawMa,
      unit: 'mA',
      channel: decoded.analog.channel || undefined,
      quality: analogQuality.quality,
      qualityReason: analogQuality.reason,
      validationReference: analogQuality.reference,
    });

    const config = dispositivo?.configuracionLecturas?.entradaAnalogica;
    const sensorKey =
      config?.variable === 'nivel_napa'
        ? 'Napa'
        : config?.variable === 'presion_agua'
          ? 'Presión'
          : undefined;
    const calibrated = sensorKey ? valores[sensorKey]?.[0] : undefined;
    const value = calibrated?.valores?.actual;
    if (typeof value !== 'number' || !Number.isFinite(value)) return readings;

    readings.push({
      serviceId:
        config?.variable === 'nivel_napa' ? 'nivel-napa' : 'presion-agua',
      variable:
        config?.variable === 'nivel_napa' ? 'nivel_napa' : 'presion_agua',
      value,
      unit: calibrated?.unidad || config?.unidadSalida || '',
      channel: decoded.analog.channel || undefined,
      rawValue: decoded.analog.rawMa,
      rawUnit: 'mA',
      reference:
        config?.variable === 'nivel_napa' ? 'nivel_terreno' : undefined,
      waterColumnM: calibrated?.valores?.columnaAgua,
      installationDepthM: calibrated?.valores?.profundidadInstalacion,
      conversionModel:
        config?.variable === 'nivel_napa' ? 'lineal-4-20ma-v1' : undefined,
      quality: 'valid',
      qualityReason: 'Valor calibrado desde una corriente 4-20 mA valida.',
      validationReference: analogQuality.reference,
    });

    return readings;
  }

  private readingsFromValores(
    valores: IValoresV2['valores'],
  ): ILorawanRawReading[] {
    const definitions: Array<{
      sensor: keyof IValoresV2['valores'];
      variable: 'humedad_suelo' | 'salinidad_suelo' | 'temperatura_suelo';
      unit: string;
    }> = [
      {
        sensor: 'Humedad Suelo Profundidad',
        variable: 'humedad_suelo',
        unit: '%',
      },
      { sensor: 'Salinidad Suelo', variable: 'salinidad_suelo', unit: 'VIC' },
      {
        sensor: 'Temperatura Suelo',
        variable: 'temperatura_suelo',
        unit: 'C',
      },
    ];

    return definitions.flatMap(({ sensor, variable, unit }) =>
      (valores[sensor] || []).flatMap((row) => {
        const value = row?.valores?.actual;
        if (typeof value !== 'number' || !Number.isFinite(value)) return [];
        const quality = validateControllerReading(variable, value);
        return [
          {
            serviceId: 'perfil-suelo-sentek',
            variable,
            value,
            unit: row.unidad || unit,
            depthCm: row.profundidad,
            quality: quality.quality,
            qualityReason: quality.reason,
            validationReference: quality.reference,
          } as ILorawanRawReading,
        ];
      }),
    );
  }

  private validatedValores(
    valores: IValoresV2['valores'],
  ): IValoresV2['valores'] {
    const variableBySensor: Partial<
      Record<
        keyof IValoresV2['valores'],
        Parameters<typeof validateControllerReading>[0]
      >
    > = {
      'Humedad Suelo Profundidad': 'humedad_suelo',
      'Salinidad Suelo': 'salinidad_suelo',
      'Temperatura Suelo': 'temperatura_suelo',
      'Entrada Analógica': 'corriente_analogica',
    };
    const result: IValoresV2['valores'] = {};

    Object.entries(valores).forEach(([sensor, rows]) => {
      const variable = variableBySensor[sensor as keyof IValoresV2['valores']];
      result[sensor as keyof IValoresV2['valores']] = (rows || []).map(
        (row) => {
          if (!variable || !row?.valores) return row;
          const sanitized = { ...row.valores } as Record<string, any>;
          let changed = false;
          (['actual', 'min', 'max', 'promedio'] as const).forEach((key) => {
            const value = sanitized[key];
            if (typeof value !== 'number') return;
            if (
              validateControllerReading(variable, value).quality !== 'invalid'
            )
              return;
            changed = true;
            if (key === 'actual') sanitized[key] = null;
            else delete sanitized[key];
          });
          return changed ? { ...row, valores: sanitized } : row;
        },
      ) as any;
    });

    return result;
  }

  private detectModel(
    uplink: ICreateLorawanUplink,
    dispositivo?: IDispositivo,
  ): string {
    const identity = [
      uplink.deviceName,
      uplink.applicationName,
      dispositivo?.nombre,
      dispositivo?.metadata?.chirpstackDeviceProfileName,
      dispositivo?.metadata?.chirpstackDescription,
    ]
      .filter(Boolean)
      .join(' ')
      .toUpperCase();
    if (identity.includes('UC501')) return 'UC501';
    if (identity.includes('UC511')) return 'UC511';
    return 'UC501/UC511';
  }
}
