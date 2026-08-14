import { IControllerPayloadDecoder } from './controller-decoder';
import {
  ControllerDecoderRegistry,
  controllerDecoderRegistry,
} from './controller-decoder.registry';
import { MILESIGHT_UC50X_GOLDEN_FIXTURES } from './controller-decoder.golden-fixtures';
import { MILESIGHT_UC50X_DECODER_ID } from './milesight-uc50x.controller-decoder';

describe('ControllerDecoderRegistry', () => {
  it('selecciona el decoder Milesight por la estructura real del payload', () => {
    const fixture = MILESIGHT_UC50X_GOLDEN_FIXTURES.observedFieldFrame;
    const result = controllerDecoderRegistry.decode({
      data: fixture.payloadBase64,
      devEUI: '24E124454E358347',
      deviceName: 'Controlador campo UC511',
      fPort: 85,
    });

    expect(result).toMatchObject({
      decoderId: MILESIGHT_UC50X_DECODER_ID,
      decoderVersion: '1.2.0',
      manufacturer: 'Milesight',
      model: 'UC511',
      capabilities: { soilProfile: true, analogInput: true },
    });
    expect(
      result?.readings.filter((row) => row.variable === 'humedad_suelo'),
    ).toHaveLength(12);
    expect(
      result?.readings.find((row) => row.variable === 'corriente_analogica')
        ?.value,
    ).toBeCloseTo(fixture.expectedCurrentMa, 2);
    expect(
      result?.readings.find(
        (row) =>
          row.variable === 'humedad_suelo' &&
          row.depthCm === fixture.expectedMoisture.firstDepthCm,
      )?.value,
    ).toBeCloseTo(fixture.expectedMoisture.firstValue, 5);
    expect(
      result?.readings.find(
        (row) =>
          row.variable === 'humedad_suelo' &&
          row.depthCm === fixture.expectedMoisture.lastDepthCm,
      )?.value,
    ).toBeCloseTo(fixture.expectedMoisture.lastValue, 5);
    expect(
      result?.readings.find((row) => row.variable === 'humedad_suelo')?.quality,
    ).toBe('valid');
    expect(
      result?.readings.find((row) => row.variable === 'salinidad_suelo')
        ?.quality,
    ).toBe('unverified');
    expect(
      result?.readings.find(
        (row) => row.variable === 'salinidad_suelo' && row.depthCm === 10,
      )?.value,
    ).toBeCloseTo(fixture.expectedVicAt10Cm, 3);
  });

  it('reproduce los ejemplos oficiales Milesight para analogico y SDI-12', () => {
    const fixtures = MILESIGHT_UC50X_GOLDEN_FIXTURES;
    const analog = controllerDecoderRegistry.decode({
      data: Buffer.from(fixtures.officialAnalog.payloadHex, 'hex').toString(
        'base64',
      ),
      fPort: 85,
    });
    const sdi12 = controllerDecoderRegistry.decode({
      data: Buffer.from(fixtures.officialSdi12.payloadHex, 'hex').toString(
        'base64',
      ),
      fPort: 85,
    });

    expect(
      analog?.readings.find((row) => row.variable === 'corriente_analogica'),
    ).toMatchObject({
      value: fixtures.officialAnalog.expectedCurrentMa,
      unit: 'mA',
      quality: 'valid',
    });
    expect(
      sdi12?.readings.filter((row) => row.variable === 'humedad_suelo'),
    ).toEqual([
      expect.objectContaining({
        depthCm: 10,
        value: fixtures.officialSdi12.expectedValues[0],
        quality: 'valid',
      }),
      expect.objectContaining({
        depthCm: 20,
        value: fixtures.officialSdi12.expectedValues[1],
        quality: 'valid',
      }),
      expect.objectContaining({
        depthCm: 30,
        value: fixtures.officialSdi12.expectedValues[2],
        quality: 'valid',
      }),
    ]);
  });

  it.each([
    MILESIGHT_UC50X_GOLDEN_FIXTURES.liveArturoChannel12,
    MILESIGHT_UC50X_GOLDEN_FIXTURES.liveGilardoniChannel12,
  ])(
    'reproduce el uplink vivo $devEUI sin inventar humedad ni otros canales',
    (fixture) => {
      const result = controllerDecoderRegistry.decode(
        {
          data: Buffer.from(fixture.payloadHex, 'hex').toString('base64'),
          devEUI: fixture.devEUI,
          fPort: 85,
        },
        {
          configuracionLecturas: {
            perfilSuelo: {
              tipo: 'sonda_sentek_120cm',
              protocolo: 'SDI-12',
              niveles: 12,
              profundidadesCm: [
                10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
              ],
              variables: ['humedad_vwc', 'salinidad_vic', 'temperatura'],
            },
          },
        } as any,
      );

      expect(result?.cycleChannels).toEqual([11]);
      expect(
        result?.readings.filter((row) => row.variable === 'humedad_suelo'),
      ).toHaveLength(0);
      expect(
        result?.readings
          .filter((row) => row.variable === 'temperatura_suelo')
          .map(({ depthCm, value, quality }) => ({ depthCm, value, quality })),
      ).toEqual(
        fixture.expectedTemperatures.map((value, index) => ({
          depthCm: 100 + index * 10,
          value,
          quality: 'valid',
        })),
      );
    },
  );

  it('usa las profundidades configuradas del dispositivo sin fijarlas en el decoder', () => {
    const fixture = MILESIGHT_UC50X_GOLDEN_FIXTURES.liveArturoChannel12;
    const result = controllerDecoderRegistry.decode(
      {
        data: Buffer.from(fixture.payloadHex, 'hex').toString('base64'),
        fPort: 85,
      },
      {
        configuracionLecturas: {
          perfilSuelo: {
            tipo: 'sonda_sentek_120cm',
            protocolo: 'SDI-12',
            niveles: 12,
            profundidadesCm: [5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115],
            variables: ['humedad_vwc', 'salinidad_vic', 'temperatura'],
          },
        },
      } as any,
    );

    expect(
      result?.readings
        .filter((row) => row.variable === 'temperatura_suelo')
        .map((row) => row.depthCm),
    ).toEqual([95, 105, 115]);
    expect(
      result?.valores['Temperatura Suelo']
        ?.slice(9)
        .map((row) => row.profundidad),
    ).toEqual([95, 105, 115]);
  });

  it('conserva evidencia fuera de rango pero no la publica como dato valido', () => {
    const invalidMoisture = Buffer.concat([
      Buffer.from([0x08, 0xdb, 0x00]),
      Buffer.from('0+34.2+101.5-1\r\n', 'ascii'),
    ]).toString('base64');
    const result = controllerDecoderRegistry.decode({
      data: invalidMoisture,
      fPort: 85,
    });

    expect(
      result?.readings.map(({ value, quality }) => ({ value, quality })),
    ).toEqual([
      { value: 34.2, quality: 'valid' },
      { value: 101.5, quality: 'invalid' },
      { value: -1, quality: 'invalid' },
    ]);
    expect(
      result?.valores['Humedad Suelo Profundidad']?.map(
        (row) => row.valores.actual,
      ),
    ).toEqual([
      34.2,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('descarta tambien los estadisticos analogicos fuera de 4-20 mA', () => {
    const result = controllerDecoderRegistry.decode({
      // actual 12, min 3, max 21 y promedio 12 mA (int16 LE / 1000)
      data: Buffer.from('0502e02eb80b0852e02e', 'hex').toString('base64'),
      fPort: 85,
    });

    expect(result?.valores['Entrada Analógica']?.[0].valores).toEqual({
      actual: 12,
      promedio: 12,
    });
  });

  it('no clasifica un controlador por contener solo la palabra Milesight', () => {
    expect(
      controllerDecoderRegistry.decode({
        data: Buffer.from('payload-no-compatible').toString('base64'),
        deviceName: 'Milesight futuro',
        fPort: 85,
      }),
    ).toBeNull();
  });

  it('rechaza ids duplicados para que el orden no oculte decoders', () => {
    const decoder = {
      id: 'duplicado',
      version: '1.0.0',
      manufacturer: 'test',
      models: ['test'],
      decode: () => null,
    } as IControllerPayloadDecoder;

    expect(() => new ControllerDecoderRegistry([decoder, decoder])).toThrow(
      'id unico',
    );
  });
});
