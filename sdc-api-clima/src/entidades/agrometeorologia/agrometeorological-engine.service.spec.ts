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

  it('conserva la implantacion historica de perennes y abre solo la campaña vigente', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T18:00:00.000Z'));

    expect(
      engine.resolveCycleStart({
        fechaSiembra: '2020-08-15',
        semilla: { cultivo: 'Manzano' },
      } as any),
    ).toBe('2026-07-01');
    expect(
      engine.resolveCycleStart({
        fechaSiembra: '2026-05-10',
        semilla: { cultivo: 'Trigo' },
      } as any),
    ).toBe('2026-05-10');

    jest.useRealTimers();
  });

  it('no mezcla campañas anteriores en acumulados de un cultivo perenne', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T18:00:00.000Z'));
    const results = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2020-08-15',
        semilla: { cultivo: 'Pecan' },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -33, lng: -61.9 },
      [
        daily('2025-07-10', 8, 16, 24),
        daily('2026-06-30', 8, 16, 24),
        daily('2026-07-01', 8, 16, 24),
        daily('2026-07-02', 10, 18, 26),
      ],
    );

    expect(results.map((item) => item.fecha)).toEqual([
      '2026-07-01',
      '2026-07-02',
    ]);
    expect(results[0].metricas.gddAccumulated).toBe(
      results[0].metricas.gddDaily,
    );
    jest.useRealTimers();
  });

  it('usa los nombres y limites del crono oficial en cultivos anuales', () => {
    const cases = [
      {
        crop: 'Trigo',
        sowing: '2026-04-01',
        date: '2026-07-13',
        stages: {
          R0_R1: 9,
          R1_R2: 92,
          R2_R3: 18,
          R3_R4: 19,
          R4_R5: 6,
          R5_R6: 10,
          R6_R7: 36,
        },
        expected: 'Espiguilla Terminal',
      },
      {
        crop: 'Soja',
        sowing: '2026-01-01',
        date: '2026-02-14',
        stages: {
          siembra_emergencia: 8,
          emergencia_R1: 35,
          R1_R3: 18,
          R3_R5: 28,
          R5_R7: 38,
        },
        expected: 'Floracion',
      },
      {
        crop: 'Maiz',
        sowing: '2026-01-01',
        date: '2026-03-16',
        stages: {
          siembra_emergencia: 8,
          emergencia_floracion: 65,
          floracion_madurez: 55,
        },
        expected: 'Floracion',
      },
      {
        crop: 'Cebada',
        sowing: '2026-04-01',
        date: '2026-07-06',
        stages: {
          siembra_emergencia: 15,
          emergencia_primer_nudo: 67,
          primer_nudo_hoja_bandera: 14,
          hoja_bandera_espigazon: 18,
          espigazon_antesis: 7,
          antesis_llenado_granos: 4,
          llenado_granos_madurez_fisiologica: 30,
        },
        expected: 'Hoja Bandera',
      },
    ];

    for (const item of cases) {
      const stage = (engine as any).resolveStage(
        {
          fechaSiembra: item.sowing,
          semilla: {
            cultivo: item.crop,
            fenologiaReferencia: {
              rangosTermicos: { codigo_generico: { min: 0, max: 99999 } },
            },
          },
          crono: { etapas: item.stages },
        },
        item.date,
        500,
      );
      expect(stage).toBe(item.expected);
    }
  });

  it('persiste historiales largos en lotes acotados', async () => {
    const upsertIndicadores = jest.fn().mockResolvedValue(undefined);
    const service = new AgrometeorologicalEngineService(
      { upsertIndicadores } as any,
      {} as any,
    );
    const indicators = Array.from({ length: 251 }, (_, index) => ({
      fecha: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
    })) as any;

    await (service as any).persistInBatches(indicators);

    expect(upsertIndicadores).toHaveBeenCalledTimes(3);
    expect(upsertIndicadores.mock.calls.map(([batch]) => batch.length)).toEqual(
      [100, 100, 51],
    );
  });
});
