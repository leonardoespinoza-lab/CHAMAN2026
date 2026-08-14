import {
  calibrateAnalogInput,
  decodeUc511SentekPayload,
  decodedUc511ToReporteValores,
  extractUc511PayloadHex,
} from './uc511-sentek.decoder';

describe('decodeUc511SentekPayload', () => {
  it('keeps the analog transducer separate from the Sentek profile', () => {
    const analog = '05 e2 9c 48 9c 48 9c 48 9c 48';
    const sdi12 =
      '08 db 00 30 2b 33 34 2e 34 30 32 31 36 2b 33 39 2e 33 34 30 37 38 2b 33 39 2e 39 39 39 38 30 0d 0a';

    const decoded = decodeUc511SentekPayload(`${analog} ${sdi12}`);

    expect(decoded).not.toBeNull();
    expect(decoded?.analog.rawMa).toBeCloseTo(9.219, 3);
    expect(decoded?.analog.channel).toBe(1);
    expect(decoded?.soil.moisture['5cm']).toBeCloseTo(34.40216, 5);
    expect(decoded?.soil.moisture['15cm']).toBeCloseTo(39.34078, 5);
    expect(decoded?.soil.moisture['25cm']).toBeCloseTo(39.9998, 5);
  });

  it('accepts compact hex and ignores missing blocks', () => {
    const decoded = decodeUc511SentekPayload(
      '08db08302b31322e352b31332e352b31342e350d0a',
    );

    expect(decoded).not.toBeNull();
    expect(decoded?.soil.temperature['5cm']).toBe(12.5);
    expect(decoded?.soil.temperature['15cm']).toBe(13.5);
    expect(decoded?.soil.temperature['25cm']).toBe(14.5);
    expect(decoded?.soil.moisture['5cm']).toBeUndefined();
  });

  it('decodes stored base64 broker payloads after converting them to hex', () => {
    const base64 =
      'BeKXSJdIl0iXSAjbACszNC4zMjg3NCszOS4zMDA3MiszOS45OTk4MA0KAAAAAAAAAAjbATArMzguODEyNzMrMzAuMzk1NjErMjcuODkwNzkNCgAAAAAAAAjbAjArMzcuNDg2ODkrMzUuMjQ3NjMrMzAuNTI4MjMNCgAAAAAAAAjbAzArMjcuMjYwNzErMjQuNTc2MDUrMzguMzcwNTcNCgAAAAAAAAjbBDArMTQ4Ny4wMTIrMTYxNy4zNjIrMTY2OC40MjYNCgAAAAAAAA==';
    const decoded = decodeUc511SentekPayload(
      Buffer.from(base64, 'base64').toString('hex'),
    );

    expect(decoded).not.toBeNull();
    expect(decoded?.analog.rawMa).toBeCloseTo(9.18, 3);
    expect(decoded?.soil.moisture['5cm']).toBeCloseTo(34.32874, 5);
    expect(decoded?.soil.moisture['35cm']).toBeCloseTo(38.81273, 5);
    expect(decoded?.soil.salinity['5cm']).toBeCloseTo(1487.012, 3);
    expect(decoded?.soil.temperature['5cm']).toBeUndefined();
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
});
