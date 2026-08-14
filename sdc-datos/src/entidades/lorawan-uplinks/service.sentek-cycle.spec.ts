import { IReporte } from 'modelos/src';
import { MILESIGHT_UC50X_GOLDEN_FIXTURES } from './controller-decoder.golden-fixtures';
import { LorawanUplinksService } from './service';

describe('LorawanUplinksService Sentek aggregation cycle', () => {
  const service = new LorawanUplinksService({} as any, {} as any, {} as any);

  const reporteConTemperaturaFinal: IReporte = {
    deveui: '24E124454E358347',
    fecha: '2026-08-12T18:00:00.000Z',
    estado: 'parcial',
    datos: {
      valores: {
        'Temperatura Suelo': Array.from({ length: 12 }, (_, index) => ({
          profundidad: 10 + index * 10,
          unidad: 'C',
          valores: { actual: index >= 9 ? 14 + index / 100 : (null as any) },
        })),
      },
    },
  };

  it('starts a new snapshot when an SDI-12 channel repeats', () => {
    const compatible = (service as any).reporteCompatibleConCiclo(
      reporteConTemperaturaFinal,
      [11],
    );
    expect(compatible).toBeNull();
  });

  it('merges another SDI-12 channel from the same sweep', () => {
    const compatible = (service as any).reporteCompatibleConCiclo(
      reporteConTemperaturaFinal,
      [0],
    );
    expect(compatible).toBe(reporteConTemperaturaFinal);
  });

  it('allows the independent analog sensor to complete the recent controller snapshot', () => {
    const compatible = (service as any).reporteCompatibleConCiclo(
      reporteConTemperaturaFinal,
      [],
    );
    expect(compatible).toBe(reporteConTemperaturaFinal);
  });

  it('uses recorded channel evidence instead of guessing a custom mapping from values', () => {
    const report = {
      ...reporteConTemperaturaFinal,
      metadataLora: { profileChannels: [11] },
      datos: {
        valores: {
          'Salinidad Suelo': Array.from({ length: 12 }, (_, index) => ({
            profundidad: 10 + index * 10,
            unidad: 'VIC',
            valores: { actual: index < 3 ? 1200 + index : (null as any) },
          })),
        },
      },
    } as IReporte;

    expect((service as any).reporteCompatibleConCiclo(report, [4])).toBe(
      report,
    );
    expect((service as any).reporteCompatibleConCiclo(report, [11])).toBeNull();
  });

  it('never creates or updates a sensor report from a configuration ACK', async () => {
    const reportes = {
      getByDeveuiAndFecha: jest.fn(),
      getRecentByDeveui: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    const dispositivos = { update: jest.fn() };
    const isolated = new LorawanUplinksService(
      {} as any,
      dispositivos as any,
      reportes as any,
    );
    const ack = MILESIGHT_UC50X_GOLDEN_FIXTURES.rollbackConfigurationAck;

    const synced = await (isolated as any).syncSentekReport(
      {
        devEUI: '24E124454E358520',
        timestamp: '2026-08-14T18:07:52.000Z',
        fCnt: 164,
        fPort: 85,
        data: Buffer.from(ack.payloadHex, 'hex').toString('base64'),
      },
      { _id: 'gilardoni' },
    );

    expect(synced).toBe(false);
    expect(reportes.getByDeveuiAndFecha).not.toHaveBeenCalled();
    expect(reportes.getRecentByDeveui).not.toHaveBeenCalled();
    expect(reportes.create).not.toHaveBeenCalled();
    expect(reportes.update).not.toHaveBeenCalled();
    expect(dispositivos.update).not.toHaveBeenCalled();
  });

  it('emits every decoded depth and the analog sensor as raw readings without averaging', () => {
    const frame = (service as any).toRawFrame(
      {
        _id: 'uplink-1',
        devEUI: '24E124454E358347',
        timestamp: '2026-08-13T12:00:00.000Z',
        fCnt: 42,
        fPort: 85,
        gatewayID: 'arturo',
        data: Buffer.from(
          '05e29c489c489c489c4808db00302b33342e34303231362b33392e33343037382b33392e39393938300d0a',
          'hex',
        ).toString('base64'),
      },
      {
        configuracionLecturas: {
          entradaAnalogica: {
            canal: 1,
            tipoSenal: '4-20mA',
            variable: 'nivel_napa',
            entradaMinMa: 4,
            entradaMaxMa: 20,
            salidaMin: 0,
            salidaMax: 10,
            unidadSalida: 'm',
            profundidadInstalacionM: 6,
          },
        },
      },
    );

    expect(frame.fCnt).toBe(42);
    expect(frame).toMatchObject({
      decoderId: 'milesight-uc501-uc511',
      decoderVersion: '1.2.0',
      controllerManufacturer: 'Milesight',
      profileChannels: [0],
    });
    expect(
      frame.readings.filter((row: any) => row.variable === 'humedad_suelo'),
    ).toHaveLength(3);
    expect(
      frame.readings.find((row: any) => row.depthCm === 10)?.value,
    ).toBeCloseTo(34.40216, 5);
    expect(
      frame.readings.find((row: any) => row.variable === 'corriente_analogica')
        ?.value,
    ).toBeCloseTo(9.219, 3);
    expect(
      frame.readings.find((row: any) => row.variable === 'nivel_napa')?.value,
    ).toBeCloseTo(2.738, 3);
    expect(
      frame.readings.find((row: any) => row.variable === 'nivel_napa'),
    ).toMatchObject({
      reference: 'nivel_terreno',
      installationDepthM: 6,
      conversionModel: 'lineal-4-20ma-v1',
      quality: 'valid',
    });
  });

  it('emits calibrated pressure without losing it to an encoding mismatch', () => {
    const frame = (service as any).toRawFrame(
      {
        _id: 'uplink-pressure',
        devEUI: '24E124454E358347',
        timestamp: '2026-08-13T12:00:00.000Z',
        fCnt: 43,
        fPort: 85,
        gatewayID: 'arturo',
        data: Buffer.from(
          '05e29c489c489c489c4808db00302b33342e34303231362b33392e33343037382b33392e39393938300d0a',
          'hex',
        ).toString('base64'),
      },
      {
        configuracionLecturas: {
          entradaAnalogica: {
            canal: 1,
            tipoSenal: '4-20mA',
            variable: 'presion_agua',
            entradaMinMa: 4,
            entradaMaxMa: 20,
            salidaMin: 0,
            salidaMax: 10,
            unidadSalida: 'bar',
          },
        },
      },
    );

    expect(
      frame.readings.find((row: any) => row.variable === 'presion_agua'),
    ).toMatchObject({
      value: 3.262,
      unit: 'bar',
      rawValue: 9.219,
      rawUnit: 'mA',
    });
  });
});
