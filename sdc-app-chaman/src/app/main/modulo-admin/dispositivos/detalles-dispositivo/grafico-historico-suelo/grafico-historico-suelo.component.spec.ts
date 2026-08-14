import { ILorawanRawFrame, ILorawanRawReading } from 'modelos/src';
import { GraficoHistoricoSueloComponent } from './grafico-historico-suelo.component';

describe('GraficoHistoricoSueloComponent', () => {
  function frame(timestamp: string, readings: ILorawanRawReading[], fCnt = 1): ILorawanRawFrame {
    return {
      decodeStatus: 'decoded',
      devEUI: '24E124454E358347',
      fCnt,
      readings,
      timestamp,
    };
  }

  function humedad(depthCm: number, value: number): ILorawanRawReading {
    return {
      depthCm,
      rawUnit: '%',
      rawValue: value,
      serviceId: 'perfil-suelo-sentek',
      unit: '%',
      value,
      variable: 'humedad_suelo',
    };
  }

  function prepare(rawFrames: ILorawanRawFrame[]): GraficoHistoricoSueloComponent {
    const component = new GraficoHistoricoSueloComponent();
    component.rawFrames = rawFrames;
    component.ngOnChanges({ rawFrames: {} as any });
    return component;
  }

  it('construye 12 curvas y 12 filas de perfil desde cuatro tramas crudas de tres profundidades', () => {
    const component = prepare([
      frame('2026-08-14T10:00:00.000Z', [humedad(10, 21), humedad(20, 22), humedad(30, 23)], 1),
      frame('2026-08-14T10:05:00.000Z', [humedad(40, 24), humedad(50, 25), humedad(60, 26)], 2),
      frame('2026-08-14T10:10:00.000Z', [humedad(70, 27), humedad(80, 28), humedad(90, 29)], 3),
      frame('2026-08-14T10:15:00.000Z', [humedad(100, 30), humedad(110, 31), humedad(120, 32)], 4),
    ]);

    const expectedDepths = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
    const soilSeries = component.chartOptions?.series || [];

    expect(soilSeries.map((series: any) => series.name)).toEqual(expectedDepths.map((depth) => `${depth} cm`));
    expect(soilSeries.every((series: any) => series.data.length === 1)).toBeTrue();
    expect(component.profileRows.map((row) => row.profundidad)).toEqual(expectedDepths);
    expect(component.profileRows).toHaveSize(12);
    expect(component.profileCoverageNotice).toBe('Perfil completo: 12/12 niveles recibidos entre 10 y 120 cm.');
    expect(component.resumen).toContain('12/12 profundidades detectadas');
    expect(component.resumen).toContain('12 datos crudos');
  });

  it('mantiene visible la corriente 4-20 mA sin inventar una napa calibrada', () => {
    const component = prepare([
      frame('2026-08-14T10:00:00.000Z', [
        {
          channel: 1,
          serviceId: 'entrada-analogica',
          unit: 'mA',
          value: 9.24,
          variable: 'corriente_analogica',
        },
      ]),
    ]);

    expect(component.analogChartOptions).toBeDefined();
    expect(component.analogActual).toBe(9.24);
    expect(component.analogResumen).toContain('9.240 mA');
    expect(component.napaChartOptions).toBeUndefined();
    expect(component.napaActual).toBeUndefined();
    expect(component.napaResumen).toBe('');
  });

  it('separa lecturas invalidas de VIC pendiente de calibracion', () => {
    const rawFrame = frame('2026-08-14T10:00:00.000Z', [
      { ...humedad(10, 101), quality: 'invalid' },
      {
        depthCm: 10,
        quality: 'unverified',
        serviceId: 'perfil-suelo-sentek',
        unit: 'VIC',
        value: 1487.012,
        variable: 'salinidad_suelo',
      },
    ]);
    const component = prepare([rawFrame]);

    expect(component.rawInvalidReadingCount(rawFrame)).toBe(1);
    expect(component.rawUnverifiedReadingCount(rawFrame)).toBe(1);
    expect(component.chartOptions?.series || []).toHaveSize(1);
  });

  it('muestra la napa calibrada junto con la evidencia 4-20 mA cuando la trama contiene ambas lecturas', () => {
    const component = prepare([
      frame('2026-08-14T10:00:00.000Z', [
        {
          channel: 1,
          serviceId: 'nivel-napa',
          unit: 'mA',
          value: 9.24,
          variable: 'corriente_analogica',
        },
        {
          channel: 1,
          conversionModel: 'lineal-4-20ma-v1',
          installationDepthM: 6,
          reference: 'nivel_terreno',
          serviceId: 'nivel-napa',
          unit: 'm',
          value: 2.72,
          variable: 'nivel_napa',
          waterColumnM: 3.28,
        },
      ]),
    ]);

    expect(component.analogChartOptions).toBeDefined();
    expect(component.analogActual).toBe(9.24);
    expect(component.napaChartOptions).toBeDefined();
    expect(component.napaActual).toBe(2.72);
    expect(component.napaResumen).toContain('2.72 m bajo el terreno');
    expect(component.napaChartOptions.series[0].data).toEqual([jasmine.objectContaining({ y: 2.72, unit: 'm' })]);
  });
});
