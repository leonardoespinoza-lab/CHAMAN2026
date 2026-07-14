import { IObservacionMeteorologicaNormalizada } from 'modelos/src';
import { AgrometeorologicalEngineService } from './agrometeorological-engine.service';

describe('AgrometeorologicalEngineService', () => {
  const engine = new AgrometeorologicalEngineService({} as any, {} as any);
  const daily = (
    date: string,
    min: number,
    mean: number,
    max: number,
  ): IObservacionMeteorologicaNormalizada => ({
    idEstablecimiento: '64b000000000000000000003',
    timestamp: `${date}T15:00:00.000Z`,
    fechaLocal: date,
    timezone: 'America/Argentina/Cordoba',
    granularidad: 'daily',
    estado: 'estimated',
    esPronostico: false,
    valores: {
      temperatureMinC: min,
      temperatureMeanC: mean,
      temperatureMaxC: max,
      relativeHumidityMinPct: 40,
      relativeHumidityMeanPct: 65,
      relativeHumidityMaxPct: 90,
      precipitationMm: 2,
      shortwaveRadiationMjM2: 18,
      windSpeedMs: 2,
      et0Mm: 4,
    },
    fuente: 'open_meteo',
    fuentePorVariable: {
      temperatureMinC: 'open_meteo',
      temperatureMeanC: 'open_meteo',
      temperatureMaxC: 'open_meteo',
      precipitationMm: 'open_meteo',
      et0Mm: 'open_meteo',
    },
    banderasCalidad: [],
    completitudPct: 90,
    obtenidoEn: `${date}T16:00:00.000Z`,
  });

  it('genera una serie diaria acumulativa, trazable y determinista', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T18:00:00.000Z'));
    const siembra = {
      _id: '64b000000000000000000001',
      idLote: '64b000000000000000000002',
      idEstablecimiento: '64b000000000000000000003',
      fechaSiembra: '2026-07-10',
      semilla: {
        cultivo: 'Maiz',
        parametrosAgrometeorologicos: {
          version: 'test-v1',
          temperaturaBaseC: 10,
          temperaturaSuperiorC: 30,
          kcInicial: 0.3,
          kcMedio: 1.2,
          kcFinal: 0.5,
          profundidadRadicularCm: 60,
        },
      },
      crono: { etapas: { Emergencia: 10, Vegetativo: 30 } },
    } as any;
    const lote = {
      _id: '64b000000000000000000002',
      idEstablecimiento: '64b000000000000000000003',
      capacidadDeCampo: 30,
      puntoMarchitez: 12,
      suelos: [],
    } as any;
    const observations = [
      daily('2026-07-10', 8, 16, 24),
      daily('2026-07-11', 10, 18, 26),
    ];

    const first = engine.calculateIndicators(
      siembra,
      lote,
      { lat: -33, lng: -61.9 },
      observations,
    );
    const second = engine.calculateIndicators(
      siembra,
      lote,
      { lat: -33, lng: -61.9 },
      observations,
    );

    expect(first).toHaveLength(2);
    expect(first[0].metricas.gddDaily).toBeCloseTo(7, 6);
    expect(first[1].metricas.gddAccumulated).toBeCloseTo(15, 6);
    expect(first[0].metricas.etcMm).toBeCloseTo(1.2, 6);
    expect(first[1].metricas.photoperiodHours).toBeGreaterThan(9);
    expect(first[1].fuentePorVariable.temperatureMeanC).toBe('open_meteo');
    expect(first).toEqual(second);
    jest.useRealTimers();
  });

  it('no inventa riego cuando no hay un evento fechado', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: { cultivo: 'Soja' },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
    );
    expect(result.metricas.irrigationMm).toBeUndefined();
    expect(result.advertencias.join(' ')).toContain(
      'No hay eventos de riego fechados',
    );
  });

  it('calcula horas de frio y calor desde la serie horaria', () => {
    const hourly = [-2, 5, 20, 36].map((temperatureC, index) => ({
      idEstablecimiento: '64b000000000000000000003',
      timestamp: `2026-07-10T${String(index + 10).padStart(2, '0')}:00:00.000Z`,
      fechaLocal: '2026-07-10',
      timezone: 'America/Argentina/Cordoba',
      granularidad: 'hourly',
      estado: 'estimated',
      esPronostico: false,
      valores: { temperatureC, relativeHumidityPct: 75, precipitationMm: 0 },
      fuente: 'open_meteo',
      fuentePorVariable: {
        temperatureC: 'open_meteo',
        relativeHumidityPct: 'open_meteo',
        precipitationMm: 'open_meteo',
      },
      banderasCalidad: [],
      completitudPct: 45,
      obtenidoEn: '2026-07-10T18:00:00.000Z',
    })) as any;
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Trigo',
          parametrosAgrometeorologicos: {
            version: 'threshold-test',
            temperaturaBaseC: 0,
            umbralFrioC: 0,
            umbralCalorC: 35,
            umbralVpdKpa: 2,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -33, lng: -61.9 },
      hourly,
    );
    expect(result.metricas.coldHours).toBe(1);
    expect(result.metricas.heatHours).toBe(1);
    expect(result.metricas.chillingHours).toBe(1);
    expect(result.metricas.vpdMeanKpa).toBeGreaterThanOrEqual(0);
  });

  it('acumula dias secos y vuelve a cero cuando supera el umbral de lluvia', () => {
    const days = [
      daily('2026-07-10', 8, 16, 24),
      daily('2026-07-11', 8, 16, 24),
      daily('2026-07-12', 8, 16, 24),
      daily('2026-07-13', 8, 16, 24),
    ];
    days[0].valores.precipitationMm = 0;
    days[1].valores.precipitationMm = 0;
    days[2].valores.precipitationMm = 0;
    days[3].valores.precipitationMm = 1;
    const results = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: { cultivo: 'Maiz' },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -33, lng: -61.9 },
      days,
    );
    expect(results[2].metricas.consecutiveDryDays).toBe(3);
    expect(results[3].metricas.consecutiveDryDays).toBe(0);
    expect(results[2].metricas.rain7dMm).toBe(0);
    expect(results[3].metricas.rain7dMm).toBe(1);
  });

  it('devuelve null semantico y advertencia cuando faltan temperaturas', () => {
    const observation = daily('2026-07-10', 8, 16, 24);
    delete observation.valores.temperatureMinC;
    delete observation.valores.temperatureMaxC;
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: { cultivo: 'Maiz' },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -33, lng: -61.9 },
      [observation],
    );
    expect(result.metricas.gddDaily).toBeUndefined();
    expect(result.advertencias.join(' ')).toContain('GDD no calculable');
  });
});
