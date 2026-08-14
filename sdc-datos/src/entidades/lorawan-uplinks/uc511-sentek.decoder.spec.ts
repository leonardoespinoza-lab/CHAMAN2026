import {
  calibrateAnalogInput,
  decodeUc511SentekPayload,
  decodedUc511ToReporteValores,
  extractUc511PayloadHex,
} from './uc511-sentek.decoder';
import { MILESIGHT_UC50X_GOLDEN_FIXTURES } from './controller-decoder.golden-fixtures';

describe('decodeUc511SentekPayload', () => {
  it('keeps the analog transducer separate from the Sentek profile', () => {
    const analog = '05 e2 9c 48 9c 48 9c 48 9c 48';
    const sdi12 =
      '08 db 00 30 2b 33 34 2e 34 30 32 31 36 2b 33 39 2e 33 34 30 37 38 2b 33 39 2e 39 39 39 38 30 0d 0a';

    const decoded = decodeUc511SentekPayload(`${analog} ${sdi12}`);

    expect(decoded).not.toBeNull();
    expect(decoded?.analog.rawMa).toBeCloseTo(9.219, 3);
    expect(decoded?.analog.channel).toBe(1);
    expect(decoded?.soil.moisture['10cm']).toBeCloseTo(34.40216, 5);
    expect(decoded?.soil.moisture['20cm']).toBeCloseTo(39.34078, 5);
    expect(decoded?.soil.moisture['30cm']).toBeCloseTo(39.9998, 5);
  });

  it('accepts compact hex and ignores missing blocks', () => {
    const decoded = decodeUc511SentekPayload(
      '08db08302b31322e352b31332e352b31342e350d0a',
    );

    expect(decoded).not.toBeNull();
    expect(decoded?.soil.temperature['10cm']).toBe(12.5);
    expect(decoded?.soil.temperature['20cm']).toBe(13.5);
    expect(decoded?.soil.temperature['30cm']).toBe(14.5);
    expect(decoded?.soil.moisture['10cm']).toBeUndefined();
  });

  it('decodes stored base64 broker payloads after converting them to hex', () => {
    const base64 =
      'BeKXSJdIl0iXSAjbACszNC4zMjg3NCszOS4zMDA3MiszOS45OTk4MA0KAAAAAAAAAAjbATArMzguODEyNzMrMzAuMzk1NjErMjcuODkwNzkNCgAAAAAAAAjbAjArMzcuNDg2ODkrMzUuMjQ3NjMrMzAuNTI4MjMNCgAAAAAAAAjbAzArMjcuMjYwNzErMjQuNTc2MDUrMzguMzcwNTcNCgAAAAAAAAjbBDArMTQ4Ny4wMTIrMTYxNy4zNjIrMTY2OC40MjYNCgAAAAAAAA==';
    const decoded = decodeUc511SentekPayload(
      Buffer.from(base64, 'base64').toString('hex'),
    );

    expect(decoded).not.toBeNull();
    expect(decoded?.analog.rawMa).toBeCloseTo(9.18, 3);
    expect(decoded?.soil.moisture['10cm']).toBeCloseTo(34.32874, 5);
    expect(decoded?.soil.moisture['40cm']).toBeCloseTo(38.81273, 5);
    expect(decoded?.soil.salinity['10cm']).toBeCloseTo(1487.012, 3);
    expect(decoded?.soil.temperature['10cm']).toBeUndefined();
  });

  it('decodes the complete 12-depth Sentek profile at 10 cm intervals', () => {
    const block = (channel: number, values: number[]) =>
      Buffer.concat([
        Buffer.from([0x08, 0xdb, channel]),
        Buffer.from(
          `0${values.map((value) => `+${value}`).join('')}\r\n`,
          'ascii',
        ),
      ]);
    const payload = Buffer.concat([
      block(0, [1, 2, 3]),
      block(1, [4, 5, 6]),
      block(2, [7, 8, 9]),
      block(3, [10, 11, 12]),
      block(4, [101, 102, 103]),
      block(5, [104, 105, 106]),
      block(6, [107, 108, 109]),
      block(7, [110, 111, 112]),
      block(8, [11, 12, 13]),
      block(9, [14, 15, 16]),
      block(10, [17, 18, 19]),
      block(11, [20, 21, 22]),
    ]).toString('hex');

    const decoded = decodeUc511SentekPayload(payload);
    const report = decodedUc511ToReporteValores(decoded!);

    expect(Object.keys(decoded!.soil.moisture)).toHaveLength(12);
    expect(Object.keys(decoded!.soil.salinity)).toHaveLength(12);
    expect(Object.keys(decoded!.soil.temperature)).toHaveLength(12);
    expect(decoded?.soil.moisture['10cm']).toBe(1);
    expect(decoded?.soil.moisture['120cm']).toBe(12);
    expect(decoded?.soil.salinity['120cm']).toBe(112);
    expect(decoded?.soil.temperature['120cm']).toBe(22);
    expect(
      report['Humedad Suelo Profundidad']?.map((row) => row.profundidad),
    ).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
  });

  it('extracts a UC511 payload from the broker base64 without altering the evidence', () => {
    const base64 = Buffer.from('05e29c489c489c489c48', 'hex').toString(
      'base64',
    );
    expect(extractUc511PayloadHex({ data: base64 })).toBe(
      '05e29c489c489c489c48',
    );
  });

  it('does not declare napa until the independent analog sensor is calibrated', () => {
    const decoded = decodeUc511SentekPayload('05e29c489c489c489c48');
    expect(decoded).not.toBeNull();

    const raw = decodedUc511ToReporteValores(decoded!);
    expect(raw['Humedad Suelo Profundidad']).toBeUndefined();
    expect(raw['Salinidad Suelo']).toBeUndefined();
    expect(raw['Temperatura Suelo']).toBeUndefined();
    expect(raw['Entrada Analógica']?.[0].unidad).toBe('mA');
    expect(raw.Napa).toBeUndefined();
    expect(raw['Presión']).toBeUndefined();

    const calibrated = decodedUc511ToReporteValores(decoded!, {
      canal: 1,
      tipoSenal: '4-20mA',
      variable: 'nivel_napa',
      entradaMinMa: 4,
      entradaMaxMa: 20,
      salidaMin: 0,
      salidaMax: 10,
      unidadSalida: 'm',
      profundidadInstalacionM: 6,
    });
    expect(calibrated.Napa?.[0].valores?.actual).toBeCloseTo(2.738, 3);
    expect(calibrated.Napa?.[0].valores?.columnaAgua).toBeCloseTo(3.262, 3);
    expect(calibrated.Napa?.[0].valores?.profundidadInstalacion).toBe(6);
  });

  it('reports depth to water from terrain for the verified 9.24 mA field reading', () => {
    const calibrated = calibrateAnalogInput(9.24, {
      canal: 1,
      tipoSenal: '4-20mA',
      variable: 'nivel_napa',
      entradaMinMa: 4,
      entradaMaxMa: 20,
      salidaMin: 0,
      salidaMax: 10,
      unidadSalida: 'm',
      profundidadInstalacionM: 6,
    });

    expect(calibrated?.waterColumn).toBeCloseTo(3.275, 3);
    expect(calibrated?.value).toBeCloseTo(2.725, 3);
    expect(calibrated?.installationDepth).toBe(6);
  });

  it('does not publish a derived value when the raw current is invalid', () => {
    const calibrated = calibrateAnalogInput(Number.NaN, {
      canal: 1,
      tipoSenal: '4-20mA',
      variable: 'nivel_napa',
      entradaMinMa: 4,
      entradaMaxMa: 20,
      salidaMin: 0,
      salidaMax: 10,
      unidadSalida: 'm',
      profundidadInstalacionM: 6,
    });

    expect(calibrated).toBeNull();
  });

  it('preserves raw evidence but does not extrapolate outside 4-20 mA', () => {
    const config = {
      canal: 1 as const,
      tipoSenal: '4-20mA' as const,
      variable: 'nivel_napa' as const,
      entradaMinMa: 4,
      entradaMaxMa: 20,
      salidaMin: 0,
      salidaMax: 10,
      unidadSalida: 'm',
      profundidadInstalacionM: 6,
    };

    expect(calibrateAnalogInput(3.99, config)).toBeNull();
    expect(calibrateAnalogInput(20.01, config)).toBeNull();
  });

  it('labels napa as depth to water referenced to terrain', () => {
    const calibrated = calibrateAnalogInput(9.24, {
      canal: 1,
      tipoSenal: '4-20mA',
      variable: 'nivel_napa',
      entradaMinMa: 4,
      entradaMaxMa: 20,
      salidaMin: 0,
      salidaMax: 10,
      unidadSalida: 'm',
      profundidadInstalacionM: 6,
    });

    expect(calibrated).toMatchObject({
      value: 2.725,
      waterColumn: 3.275,
      installationDepth: 6,
      reference: 'nivel_terreno',
      conversionModel: 'lineal-4-20ma-v1',
    });
  });

  it('decodes the v2 signed int16 analog payload in amperes', () => {
    const decoded = decodeUc511SentekPayload(
      '0502e02ee02ee02ee02e', // 12.000 mA current/min/max/average
    );
    expect(decoded?.analog.rawMa).toBe(12);
    expect(decoded?.analog.averageMa).toBe(12);
  });

  it('parses signed SDI-12 values even without a trailing CRLF', () => {
    const decoded = decodeUc511SentekPayload(
      Buffer.concat([
        Buffer.from([0x08, 0xdb, 0x08]),
        Buffer.from('A-1.5+2.5-3.5', 'ascii'),
      ]).toString('hex'),
    );

    expect(decoded?.soil.temperature).toEqual({
      '10cm': -1.5,
      '20cm': 2.5,
      '30cm': -3.5,
    });
  });

  it('does not confuse a Milesight configuration ACK with analog telemetry', () => {
    const decoded = decodeUc511SentekPayload(
      MILESIGHT_UC50X_GOLDEN_FIXTURES.rollbackConfigurationAck.payloadHex,
    );

    expect(decoded).toBeNull();
  });

  it('decodes the successful 12-level field sweep and the independent water sensor', () => {
    const fixture = MILESIGHT_UC50X_GOLDEN_FIXTURES.successfulGilardoniSweep;
    const decoded = decodeUc511SentekPayload(
      fixture.frames.map((frame) => frame.payloadHex).join(''),
    );
    const report = decodedUc511ToReporteValores(
      decoded!,
      {
        canal: 1,
        tipoSenal: '4-20mA',
        variable: 'nivel_napa',
        entradaMinMa: 4,
        entradaMaxMa: 20,
        salidaMin: 0,
        salidaMax: 10,
        unidadSalida: 'm',
        profundidadInstalacionM: 6,
        longitudCableM: 10,
        tramoCableExteriorM: 4,
      },
      {
        niveles: 12,
        profundidadesCm: [5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115],
      },
    );

    expect(Object.values(decoded!.soil.moisture)).toEqual(
      fixture.expectedMoisture,
    );
    expect(Object.values(decoded!.soil.salinity)).toEqual(fixture.expectedVic);
    expect(Object.values(decoded!.soil.temperature)).toEqual(
      fixture.expectedTemperatureC,
    );
    expect(decoded?.analog.rawMa).toBeCloseTo(fixture.expectedCurrentMa, 3);
    expect(report.Napa?.[0].valores?.columnaAgua).toBeCloseTo(
      fixture.expectedWaterColumnM,
      3,
    );
    expect(report.Napa?.[0].valores?.actual).toBeCloseTo(
      fixture.expectedDepthBelowTerrainM,
      3,
    );
    expect(
      report['Humedad Suelo Profundidad']?.map((row) => row.profundidad),
    ).toEqual([5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115]);
  });

  it('uses an explicit per-device channel map for future controller layouts', () => {
    const decoded = decodeUc511SentekPayload('08db00302b31302b32302b33300d0a', {
      mapeoCanalesSdi12: [
        {
          canalMilesight: 1,
          variable: 'temperatura',
          posicionesPerfil: [12, 6, 1],
        },
      ],
    });

    expect(decoded?.soil.temperature).toEqual({
      '120cm': 10,
      '60cm': 20,
      '10cm': 30,
    });
    expect(decoded?.soil.moisture).toEqual({});
  });
});
