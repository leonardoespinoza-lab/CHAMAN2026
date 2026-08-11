import {
  AGROMET_ENGINE_VERSION,
  IObservacionMeteorologicaNormalizada,
} from 'modelos/src';
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
  const dailyWithSoil = (
    date: string,
    soilMoistureM3M3: Record<string, number>,
  ): IObservacionMeteorologicaNormalizada => {
    const observation = daily(date, 8, 16, 24);
    observation.valores.soilMoistureM3M3 = soilMoistureM3M3;
    observation.fuentePorVariable.soilMoistureM3M3 = 'open_meteo';
    return observation;
  };
  const hourlyTemperature = (
    date: string,
    hour: number,
    temperatureC: number,
    source: 'sensor' | 'station' | 'open_meteo',
  ): IObservacionMeteorologicaNormalizada => ({
    idEstablecimiento: '64b000000000000000000003',
    timestamp: `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`,
    fechaLocal: date,
    timezone: 'America/Argentina/Cordoba',
    granularidad: 'hourly',
    estado: source === 'open_meteo' ? 'estimated' : 'observed',
    esPronostico: false,
    valores: { temperatureC },
    fuente: source,
    fuentePorVariable: { temperatureC: source },
    banderasCalidad: [],
    completitudPct: 100,
    obtenidoEn: `${date}T23:59:00.000Z`,
  });
  const hourlyWeather = (
    date: string,
    hour: number,
    values: {
      temperatureC?: number;
      relativeHumidityPct?: number;
      precipitationMm?: number;
      shortwaveRadiationWm2?: number;
      et0Mm?: number;
    },
  ): IObservacionMeteorologicaNormalizada => ({
    ...hourlyTemperature(date, hour, values.temperatureC ?? 20, 'open_meteo'),
    valores: { ...values },
    fuentePorVariable: Object.fromEntries(
      Object.keys(values).map((key) => [key, 'open_meteo']),
    ) as any,
  });
  const localHourlyTemperatureDay = (
    date: string,
    temperatureC: number,
    source: 'sensor' | 'station' | 'open_meteo' = 'open_meteo',
    excludedHours: number[] = [],
  ): IObservacionMeteorologicaNormalizada[] => {
    const [year, month, day] = date.split('-').map(Number);
    return Array.from({ length: 24 }, (_, hour) => hour)
      .filter((hour) => !excludedHours.includes(hour))
      .map((hour) => ({
        ...hourlyTemperature(date, hour, temperatureC, source),
        timestamp: new Date(
          Date.UTC(year, month - 1, day, hour + 3),
        ).toISOString(),
        timezone: 'America/Argentina/Buenos_Aires',
      }));
  };
  const calculateTemperatureDay = (
    observations: IObservacionMeteorologicaNormalizada[],
  ) =>
    engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'daily-source-priority-test',
            temperaturaBaseC: 10,
            temperaturaSuperiorC: 30,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -33, lng: -61.9 },
      observations,
    )[0];

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
    expect(first[1].fuentePorVariable.relativeHumidityMeanPct).toBe(
      'open_meteo',
    );
    expect(first[1].fuentePorVariable.shortwaveRadiationMjM2).toBe(
      'open_meteo',
    );
    expect(first).toEqual(second);
    jest.useRealTimers();
  });

  it.each([
    ['sensor', 'derived_sensor'],
    ['station', 'derived_station'],
  ] as const)(
    'prioriza temperatura horaria %s completa sobre el agregado diario Open-Meteo',
    (source, expectedSource) => {
      const date = '2026-07-10';
      const result = calculateTemperatureDay([
        daily(date, 8, 16, 24),
        ...Array.from({ length: 24 }, (_, hour) =>
          hourlyTemperature(date, hour, 20, source),
        ),
      ]);

      expect(result.metricas.temperatureMinC).toBe(20);
      expect(result.metricas.temperatureMeanC).toBe(20);
      expect(result.metricas.temperatureMaxC).toBe(20);
      expect(result.metricas.gddDaily).toBe(10);
      expect(result.fuentePorVariable.temperatureMinC).toBe(expectedSource);
      expect(result.fuentePorVariable.temperatureMeanC).toBe(expectedSource);
      expect(result.fuentePorVariable.temperatureMaxC).toBe(expectedSource);
    },
  );

  it('reconstruye el agregado desde la serie horaria canonica completa con fallback', () => {
    const date = '2026-07-10';
    const hourly = Array.from({ length: 24 }, (_, hour) =>
      hourlyTemperature(
        date,
        hour,
        hour === 12 ? 30 : 10,
        hour === 12 ? 'sensor' : 'open_meteo',
      ),
    );
    const result = calculateTemperatureDay([daily(date, 8, 16, 24), ...hourly]);

    expect(result.metricas.temperatureMinC).toBe(10);
    expect(result.metricas.temperatureMeanC).toBeCloseTo(10.833333, 5);
    expect(result.metricas.temperatureMaxC).toBe(30);
    expect(result.metricas.gddDaily).toBe(10);
    expect(result.fuentePorVariable.temperatureMinC).toBe('mixed');
    expect(result.fuentePorVariable.temperatureMeanC).toBe('mixed');
    expect(result.fuentePorVariable.temperatureMaxC).toBe('mixed');
    expect(result.banderasCalidad).not.toContain(
      'insufficient_hourly_temperature_coverage_for_daily_aggregate',
    );
  });

  it('no deja que una lectura sensor aislada desplace un agregado diario completo', () => {
    const date = '2026-07-10';
    const result = calculateTemperatureDay([
      daily(date, 8, 16, 24),
      hourlyTemperature(date, 12, 40, 'sensor'),
    ]);

    expect(result.metricas.temperatureMinC).toBe(8);
    expect(result.metricas.temperatureMeanC).toBe(16);
    expect(result.metricas.temperatureMaxC).toBe(24);
    expect(result.metricas.gddDaily).toBe(7);
    expect(result.fuentePorVariable.temperatureMinC).toBe('open_meteo');
    expect(result.fuentePorVariable.temperatureMeanC).toBe('open_meteo');
    expect(result.fuentePorVariable.temperatureMaxC).toBe('open_meteo');
    expect(result.banderasCalidad).toContain(
      'insufficient_hourly_temperature_coverage_for_daily_aggregate',
    );
    expect(result.advertencias.join(' ')).toContain(
      'no se uso para reconstruir minimas, medias, maximas ni GDD',
    );
  });

  it('exige el dia horario completo para reemplazar un agregado diario existente', () => {
    const date = '2026-07-10';
    const partialCanonical = Array.from({ length: 19 }, (_, hour) =>
      hourlyTemperature(
        date,
        hour,
        hour === 12 ? 30 : 10,
        hour === 12 ? 'sensor' : 'open_meteo',
      ),
    );
    const result = calculateTemperatureDay([
      daily(date, 8, 16, 24),
      ...partialCanonical,
    ]);

    expect(result.metricas.temperatureMinC).toBe(8);
    expect(result.metricas.temperatureMeanC).toBe(16);
    expect(result.metricas.temperatureMaxC).toBe(24);
    expect(result.metricas.gddDaily).toBe(7);
    expect(result.fuentePorVariable.temperatureMinC).toBe('open_meteo');
    expect(result.banderasCalidad).toContain(
      'insufficient_hourly_temperature_coverage_for_daily_aggregate',
    );
    expect(result.advertencias.join(' ')).toContain(
      'minimo 100% para este reemplazo',
    );
  });

  it('muestra temperatura parcial pero no acumula GDD cuando no existe agregado persistido completo', () => {
    const date = '2026-07-10';
    const result = calculateTemperatureDay(
      Array.from({ length: 18 }, (_, hour) =>
        hourlyTemperature(date, hour, 20, 'sensor'),
      ),
    );

    expect(result.metricas.temperatureMinC).toBe(20);
    expect(result.metricas.temperatureMeanC).toBe(20);
    expect(result.metricas.temperatureMaxC).toBe(20);
    expect(result.metricas.gddDaily).toBeUndefined();
    expect(result.metricas.gddAccumulated).toBeUndefined();
    expect(result.metricas.gddAccumulationComplete).toBe(false);
    expect(result.fuentePorVariable.temperatureMinC).toBe('derived_sensor');
    expect(result.banderasCalidad).toContain(
      'partial_hourly_daily_temperature',
    );
    expect(result.banderasCalidad).toContain('incomplete_gdd_accumulation');
    expect(result.advertencias.join(' ')).toContain(
      'no acumulan GDD ni desplazan la fenologia',
    );
  });

  it('descarta horas legacy sin valores y no fabrica frio, temperatura ni GDD', () => {
    const date = '2026-07-10';
    const malformed = {
      idEstablecimiento: '64b000000000000000000003',
      timestamp: `${date}T09:00:00.000Z`,
      fechaLocal: date,
      timezone: 'America/Argentina/Cordoba',
      granularidad: 'hourly',
      estado: 'observed',
      esPronostico: false,
      fuente: 'sensor',
      completitudPct: 0,
      obtenidoEn: `${date}T09:01:00.000Z`,
    } as unknown as IObservacionMeteorologicaNormalizada;

    const result = calculateTemperatureDay([daily(date, 8, 16, 24), malformed]);

    expect(result.metricas.temperatureMinC).toBe(8);
    expect(result.metricas.temperatureMeanC).toBe(16);
    expect(result.metricas.temperatureMaxC).toBe(24);
    expect(result.metricas.gddDaily).toBe(7);
    expect(result.metricas.chillingHoursAccumulated).toBeUndefined();
    expect(result.advertencias.join(' ')).toContain(
      'no se imputaron temperatura, frio ni GDD',
    );
  });

  it('etiqueta humedad diaria parcial solo cuando supera la cobertura minima', () => {
    const date = '2026-07-10';
    const result = calculateTemperatureDay(
      Array.from({ length: 18 }, (_, hour) =>
        hourlyWeather(date, hour, {
          temperatureC: 20,
          relativeHumidityPct: 80,
        }),
      ),
    );

    expect(result.metricas.relativeHumidityMinPct).toBe(80);
    expect(result.metricas.relativeHumidityMeanPct).toBe(80);
    expect(result.metricas.relativeHumidityMaxPct).toBe(80);
    expect(result.banderasCalidad).toContain('partial_hourly_daily_humidity');
    expect(result.advertencias.join(' ')).toContain(
      'humedad diaria se reconstruyo con 75% de cobertura horaria',
    );
  });

  it('no publica lluvia, radiacion ni ET0 horarios parciales como totales diarios', () => {
    const date = '2026-07-10';
    const hours = Array.from({ length: 23 }, (_, hour) =>
      hourlyWeather(date, hour, {
        temperatureC: 20,
        relativeHumidityPct: 80,
        precipitationMm: hour === 5 ? 3 : 0,
        shortwaveRadiationWm2: 100,
        et0Mm: 0.1,
      }),
    );
    const derived = (engine as any).deriveHourlyDay(
      hours,
      { coldC: 0, heatC: 35, vpdKpa: 2 },
      { version: 'coverage-test', temperaturaBaseC: 10 },
      60,
    );

    expect(derived.precipitationMm).toBeUndefined();
    expect(derived.solarRadiationMjM2).toBeUndefined();
    expect(derived.et0Mm).toBeUndefined();
    const precipitationCoverage = derived.hourlyAggregateCoverage.find(
      (item: any) => item.metric === 'precipitation',
    );
    expect(precipitationCoverage.coveragePct).toBeCloseTo(95.8, 1);
    expect(precipitationCoverage.accepted).toBe(false);
    expect(derived.hourlyAggregateCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: 'radiation', accepted: false }),
        expect.objectContaining({ metric: 'et0', accepted: false }),
      ]),
    );

    const result = calculateTemperatureDay(hours);
    expect(result.metricas.precipitationMm).toBeUndefined();
    expect(result.metricas.solarRadiationMjM2).toBeUndefined();
    expect(result.banderasCalidad).toEqual(
      expect.arrayContaining([
        'insufficient_hourly_precipitation_coverage_for_daily_total',
        'insufficient_hourly_radiation_coverage_for_daily_total',
        'insufficient_hourly_et0_coverage_for_daily_total',
      ]),
    );
    expect(result.advertencias.join(' ')).toContain('no presume lluvia cero');
  });

  it('conserva el agregado diario completo y no genera alarmas por su respaldo horario parcial', () => {
    const date = '2026-07-10';
    const result = calculateTemperatureDay([
      daily(date, 8, 16, 24),
      ...Array.from({ length: 23 }, (_, hour) =>
        hourlyWeather(date, hour, {
          temperatureC: 20,
          relativeHumidityPct: 80,
          precipitationMm: 0,
          shortwaveRadiationWm2: 100,
          et0Mm: 0.1,
        }),
      ),
    ]);

    expect(result.metricas.precipitationMm).toBe(2);
    expect(result.metricas.solarRadiationMjM2).toBe(18);
    expect(result.metricas.et0Mm).toBe(4);
    expect(result.banderasCalidad).not.toEqual(
      expect.arrayContaining([
        'insufficient_hourly_precipitation_coverage_for_daily_total',
        'insufficient_hourly_radiation_coverage_for_daily_total',
        'insufficient_hourly_et0_coverage_for_daily_total',
      ]),
    );
  });

  it('no reanuda acumulados ni ventanas moviles como si un dia faltante valiera cero', () => {
    const partialDate = '2026-07-11';
    const results = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'accumulation-gap-test',
            temperaturaBaseC: 10,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -33, lng: -61.9 },
      [
        daily('2026-07-10', 8, 16, 24),
        ...Array.from({ length: 23 }, (_, hour) =>
          hourlyWeather(partialDate, hour, {
            temperatureC: 20,
            relativeHumidityPct: 80,
            precipitationMm: 0,
            shortwaveRadiationWm2: 100,
            et0Mm: 0.1,
          }),
        ),
        daily('2026-07-12', 8, 16, 24),
      ],
    );
    const last = results[results.length - 1];

    expect(last.metricas.rainAccumulatedMm).toBeUndefined();
    expect(last.metricas.rain7dMm).toBeUndefined();
    expect(last.metricas.solarRadiationAccumulatedMjM2).toBeUndefined();
    expect(last.metricas.radiationRollingMean7d).toBeUndefined();
  });

  it('no publica un acumulado GDD ni una etapa termica automatica si falta un dia completo', () => {
    const results = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'gdd-gap-test-v1',
            estado: 'validado',
            fuente: 'Ensayo termico varietal trazable',
            procesoTermico: 'termico',
            temperaturaBaseC: 10,
            temperaturaSuperiorC: 30,
            metodoGdd: 'promedio_limitado',
            semanticaGddPorEtapa: 'rangos_acumulados_desde_inicio_termico',
            gddPorEtapa: {
              Siembra: { orden: 1, min: 0 },
              Emergencia: { orden: 2, min: 10 },
              Vegetativo: { orden: 3, min: 20 },
            },
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24), daily('2026-07-12', 8, 16, 24)],
    );

    expect(results[0].metricas.gddAccumulated).toBe(7);
    expect(results[0].metricas.gddAccumulationComplete).toBe(true);
    expect(results[1].metricas.gddDaily).toBe(7);
    expect(results[1].metricas.gddAccumulated).toBeUndefined();
    expect(results[1].metricas.gddAccumulationComplete).toBe(false);
    expect(results[1].banderasCalidad).toContain('incomplete_gdd_accumulation');
    expect(results[1].advertencias.join(' ')).toContain(
      'no se publica una suma parcial',
    );
    expect(results[1].etapaFenologica).toBe('Ciclo en seguimiento');
  });

  it('calcula la cantidad de horas esperadas segun fecha y zona horaria', () => {
    expect(
      (engine as any).expectedHourlySlots('2026-03-08', 'America/New_York'),
    ).toBe(23);
    expect(
      (engine as any).expectedHourlySlots('2026-11-01', 'America/New_York'),
    ).toBe(25);
    expect(
      (engine as any).expectedHourlySlots(
        '2026-07-10',
        'America/Argentina/Cordoba',
      ),
    ).toBe(24);
  });

  it('propaga la zona IANA al motor de frio en un dia con DST', () => {
    const start = Date.parse('2026-03-08T05:00:00.000Z');
    const observations = Array.from({ length: 23 }, (_, hour) => {
      const timestamp = new Date(start + hour * 3600000).toISOString();
      return {
        ...hourlyTemperature('2026-03-08', hour, 5, 'station'),
        timestamp,
        fechaLocal: '2026-03-08',
        timezone: 'America/New_York',
      };
    });
    const series = (engine as any).calculateColdThermalSeries(
      observations,
      '2026-03-08',
      { procesoTermico: 'dormancia_perenne' },
      '2026-03-09T03:00:00.000Z',
    );

    expect([...series.byDate.keys()]).toEqual(['2026-03-08']);
    expect(series.byDate.get('2026-03-08')).toMatchObject({
      hoursWithData: 23,
      dailyCoveragePct: 100,
      coveragePct: 100,
    });
  });

  it('no reemplaza un agregado diario de central con una serie horaria Open-Meteo', () => {
    const date = '2026-07-10';
    const stationDaily = daily(date, 5, 15, 25);
    stationDaily.fuente = 'station';
    stationDaily.estado = 'observed';
    stationDaily.fuentePorVariable.temperatureMinC = 'station';
    stationDaily.fuentePorVariable.temperatureMeanC = 'station';
    stationDaily.fuentePorVariable.temperatureMaxC = 'station';
    const result = calculateTemperatureDay([
      stationDaily,
      ...Array.from({ length: 24 }, (_, hour) =>
        hourlyTemperature(date, hour, 20, 'open_meteo'),
      ),
    ]);

    expect(result.metricas.temperatureMinC).toBe(5);
    expect(result.metricas.temperatureMeanC).toBe(15);
    expect(result.metricas.temperatureMaxC).toBe(25);
    expect(result.fuentePorVariable.temperatureMinC).toBe('station');
    expect(result.fuentePorVariable.temperatureMeanC).toBe('station');
    expect(result.fuentePorVariable.temperatureMaxC).toBe('station');
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

  it('no convierte capacidad potencial del perfil en TAW sin capas hidraulicas continuas', () => {
    const siembra = {
      _id: '64b000000000000000000001',
      idLote: '64b000000000000000000002',
      idEstablecimiento: '64b000000000000000000003',
      fechaSiembra: '2026-07-10',
      semilla: { cultivo: 'Soja' },
    } as any;
    const lote = {
      _id: '64b000000000000000000002',
      idEstablecimiento: '64b000000000000000000003',
    } as any;

    const [estimated] = engine.calculateIndicators(
      siembra,
      lote,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
      [],
      {
        loteId: lote._id,
        status: 'ready',
        stale: false,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'automatic_assessment',
        depthLayers: [],
        provenance: {},
        rootZoneAvailableWaterMm: 142,
        effectiveDepthCm: 100,
        confidence: 'medium',
      } as any,
    );

    expect(estimated.metricas.availableWaterCapacityMm).toBeUndefined();
    expect(estimated.banderasCalidad).toContain(
      'potential_profile_capacity_not_root_zone',
    );
    expect(estimated.advertencias.join(' ')).toContain(
      'capacidad potencial del perfil es descriptiva',
    );

    const [confirmed] = engine.calculateIndicators(
      siembra,
      {
        ...lote,
        suelos: [
          {
            profundidad: 100,
            capacidadDeCampo: 30,
            puntoMarchitez: 15,
            hayRaices: true,
          },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
      [],
      {
        loteId: lote._id,
        status: 'ready',
        stale: false,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'automatic_assessment',
        depthLayers: [],
        provenance: {},
        rootZoneAvailableWaterMm: 142,
        effectiveDepthCm: 100,
        confidence: 'medium',
      } as any,
    );

    expect(confirmed.metricas.availableWaterCapacityMm).toBe(150);
    expect(confirmed.advertencias.join(' ')).not.toContain(
      'perfil edáfico estimado',
    );
  });

  it('aplica capas canonicas antes del balance y conserva su condicion estimada', () => {
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
        capacidadDeCampo: 18,
        puntoMarchitez: 9,
        suelos: [],
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
      [],
      {
        loteId: '64b000000000000000000002',
        status: 'ready',
        stale: false,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'automatic_assessment',
        fieldCapacityPercentage: 30,
        wiltingPointPercentage: 15,
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 100,
            fieldCapacityPercentage: 30,
            wiltingPointPercentage: 15,
            source: 'soilgrids',
            confidence: 'medium',
          },
        ],
        provenance: {},
      } as any,
    );

    expect(result.metricas.availableWaterCapacityMm).toBe(90);
    expect(result.advertencias.join(' ')).toContain('estimado');
  });

  it('conserva el perfil uniforme confirmado cuando el assessment esta vencido', () => {
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
        capacidadDeCampo: 30,
        puntoMarchitez: 12,
        sueloConfirmadoPorUsuario: true,
        sueloReferencia: { profundidadCm: 100 },
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
      [],
      {
        loteId: '64b000000000000000000002',
        status: 'ready',
        stale: true,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'automatic_assessment',
        fieldCapacityPercentage: 40,
        wiltingPointPercentage: 20,
        depthLayers: [],
        provenance: {},
      } as any,
    );

    expect(result.metricas.availableWaterCapacityMm).toBeCloseTo(108, 6);
  });

  it('recorta un perfil 0-200 cm a la raiz objetivo sin integrar el ultimo horizonte', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'root-100-test',
            estado: 'validado',
            profundidadRadicularCm: 100,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        suelos: [
          { profundidad: 50, capacidadDeCampo: 30, puntoMarchitez: 10 },
          { profundidad: 100, capacidadDeCampo: 30, puntoMarchitez: 10 },
          { profundidad: 200, capacidadDeCampo: 55, puntoMarchitez: 10 },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      [
        dailyWithSoil('2026-07-10', {
          '0-50': 0.2,
          '50-100': 0.3,
          '100-200': 0.9,
        }),
      ],
    );

    expect(result.metricas.availableWaterCapacityMm).toBe(200);
    expect(result.metricas.rootZoneSoilMoistureM3M3).toBeCloseTo(0.25, 6);
  });

  it('pondera parcialmente la ultima capa cuando el limite cae dentro del horizonte', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'partial-layer-test',
            estado: 'validado',
            profundidadRadicularCm: 50,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        suelos: [
          { profundidad: 30, capacidadDeCampo: 30, puntoMarchitez: 10 },
          { profundidad: 100, capacidadDeCampo: 40, puntoMarchitez: 10 },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      [dailyWithSoil('2026-07-10', { '0-30': 0.1, '30-100': 0.3 })],
    );

    expect(result.metricas.availableWaterCapacityMm).toBe(120);
    expect(result.metricas.rootZoneSoilMoistureM3M3).toBeCloseTo(0.18, 6);
  });

  it('integra SoilGrids con bounds explicitos aunque el lote tenga sensores puntuales', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'explicit-bounds-test',
            estado: 'validado',
            profundidadRadicularCm: 60,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        suelos: [
          { profundidad: 20, numeroDeSensor: 1 },
          { profundidad: 80, numeroDeSensor: 2 },
          { profundidad: 200, numeroDeSensor: 3 },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
      [],
      {
        loteId: '64b000000000000000000002',
        status: 'ready',
        stale: false,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'automatic_assessment',
        confidence: 'medium',
        effectiveDepthCm: 100,
        effectiveDepthConfidence: 'medium',
        effectiveDepthIsFallback: false,
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 40,
            fieldCapacityPercentage: 30,
            wiltingPointPercentage: 10,
            source: 'soilgrids',
            confidence: 'medium',
          },
          {
            depthFromCm: 40,
            depthToCm: 100,
            fieldCapacityPercentage: 25,
            wiltingPointPercentage: 15,
            source: 'soilgrids',
            confidence: 'medium',
          },
          {
            depthFromCm: 100,
            depthToCm: 200,
            fieldCapacityPercentage: 50,
            wiltingPointPercentage: 10,
            source: 'soilgrids',
            confidence: 'medium',
          },
        ],
        provenance: {},
      } as any,
    );

    expect(result.metricas.availableWaterCapacityMm).toBeCloseTo(100, 6);
    expect(result.banderasCalidad).not.toContain(
      'point_sensor_not_hydraulic_profile',
    );
  });

  it('no convierte profundidades de sensores puntuales en horizontes hidraulicos', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'point-sensor-test',
            estado: 'validado',
            profundidadRadicularCm: 100,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        suelos: [
          {
            profundidad: 20,
            numeroDeSensor: 1,
            capacidadDeCampo: 30,
            puntoMarchitez: 10,
          },
          {
            profundidad: 200,
            numeroDeSensor: 2,
            capacidadDeCampo: 50,
            puntoMarchitez: 10,
          },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
    );

    expect(result.metricas.availableWaterCapacityMm).toBeUndefined();
    expect(result.banderasCalidad).toContain(
      'point_sensor_not_hydraulic_profile',
    );
    expect(result.advertencias.join(' ')).toContain(
      'puntos de medicion y no limites de horizontes',
    );
  });

  it('admite un perfil uniforme solo con profundidad y valores confirmados', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Soja',
          parametrosAgrometeorologicos: {
            version: 'confirmed-uniform-profile-test',
            estado: 'validado',
            profundidadRadicularCm: 60,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        capacidadDeCampo: 30,
        puntoMarchitez: 10,
        sueloConfirmadoPorUsuario: true,
        sueloReferencia: { profundidadCm: 100, confianza: 'alta' },
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
    );

    expect(result.metricas.availableWaterCapacityMm).toBeCloseTo(120, 6);
    expect(result.banderasCalidad).not.toContain(
      'legacy_uniform_hydraulics_not_root_zone',
    );
  });

  it('ignora capas artificiales derivadas de sensores puntuales aunque figuren confirmadas', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'confirmed-point-sensor-test',
            estado: 'validado',
            profundidadRadicularCm: 100,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        capacidadDeCampo: 30,
        puntoMarchitez: 10,
        sueloConfirmadoPorUsuario: true,
        sueloReferencia: { profundidadCm: 100 },
        suelos: [
          { profundidad: 20, numeroDeSensor: 1 },
          { profundidad: 80, numeroDeSensor: 2 },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
      [],
      {
        loteId: '64b000000000000000000002',
        status: 'ready',
        stale: false,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'confirmed_sensor',
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 20,
            fieldCapacityPercentage: 30,
            wiltingPointPercentage: 10,
            source: 'sensor',
            confidence: 'high',
          },
          {
            depthFromCm: 20,
            depthToCm: 80,
            fieldCapacityPercentage: 40,
            wiltingPointPercentage: 15,
            source: 'sensor',
            confidence: 'high',
          },
        ],
        provenance: {},
      } as any,
    );

    expect(result.metricas.availableWaterCapacityMm).toBeUndefined();
    expect(result.banderasCalidad).toContain(
      'point_sensor_not_hydraulic_profile',
    );
    expect(result.banderasCalidad).toContain(
      'legacy_uniform_hydraulics_not_root_zone',
    );
    expect(result.advertencias.join(' ')).toContain(
      'puntos de medicion y no limites de horizontes',
    );
  });

  it('no llama promedio radicular a capas meteorologicas que cubren solo parte de Zr', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'strict-root-model-coverage-test',
            estado: 'validado',
            profundidadRadicularCm: 100,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        capacidadDeCampo: 30,
        puntoMarchitez: 10,
      } as any,
      { lat: -33, lng: -61.9 },
      [dailyWithSoil('2026-07-10', { '0-7': 0.22, '7-28': 0.2 })],
    );

    expect(result.metricas.rootZoneSoilMoistureM3M3).toBeUndefined();
    expect(result.metricas.soilMoistureM3M3).toEqual({
      '0-7': 0.22,
      '7-28': 0.2,
    });
    expect(result.banderasCalidad).toContain(
      'incomplete_root_zone_model_coverage',
    );
  });

  it('prioriza raiz observada en un perenne y conserva su campana vigente', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2020-08-15',
        semilla: { cultivo: 'Manzano' },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        suelos: [
          {
            profundidad: 100,
            capacidadDeCampo: 30,
            puntoMarchitez: 10,
            hayRaices: true,
          },
          {
            profundidad: 150,
            capacidadDeCampo: 30,
            puntoMarchitez: 10,
            hayRaices: true,
          },
          {
            profundidad: 200,
            capacidadDeCampo: 50,
            puntoMarchitez: 10,
            hayRaices: false,
          },
        ],
      } as any,
      { lat: -39, lng: -67.6 },
      [daily('2026-07-10', 1, 8, 15)],
    );

    expect(result.metricas.availableWaterCapacityMm).toBe(300);
    expect(result.banderasCalidad).not.toContain('screening_root_depth');
  });

  it('no propaga una raiz observada hacia capas SoilGrids mas profundas', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2020-08-15',
        semilla: {
          cultivo: 'Manzano',
          parametrosAgrometeorologicos: {
            version: 'original-root-evidence-test',
            estado: 'validado',
            profundidadRadicularCm: 180,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        suelos: [
          {
            profundidad: 100,
            capacidadDeCampo: 30,
            puntoMarchitez: 10,
            hayRaices: true,
          },
        ],
      } as any,
      { lat: -39, lng: -67.6 },
      [daily('2026-07-10', 1, 8, 15)],
      [],
      {
        loteId: '64b000000000000000000002',
        status: 'ready',
        stale: false,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'automatic_assessment',
        effectiveDepthCm: 200,
        effectiveDepthSource: 'inta_cartographic',
        effectiveDepthConfidence: 'medium',
        effectiveDepthIsFallback: false,
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 100,
            fieldCapacityPercentage: 30,
            wiltingPointPercentage: 10,
            source: 'soilgrids',
            confidence: 'low',
          },
          {
            depthFromCm: 100,
            depthToCm: 200,
            fieldCapacityPercentage: 50,
            wiltingPointPercentage: 10,
            source: 'soilgrids',
            confidence: 'low',
          },
        ],
        provenance: {},
      } as any,
    );

    expect(result.metricas.availableWaterCapacityMm).toBe(200);
    expect(result.banderasCalidad).not.toContain('screening_root_depth');
  });

  it('sin raiz conocida usa screening 100 cm y nunca infiere 200 cm del perfil', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {},
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        suelos: [
          { profundidad: 100, capacidadDeCampo: 30, puntoMarchitez: 10 },
          { profundidad: 200, capacidadDeCampo: 50, puntoMarchitez: 10 },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      [dailyWithSoil('2026-07-10', { '0-100': 0.2, '100-200': 0.8 })],
    );

    expect(result.metricas.availableWaterCapacityMm).toBe(200);
    expect(result.metricas.rootZoneSoilMoistureM3M3).toBeCloseTo(0.2, 6);
    expect(result.banderasCalidad).toContain('screening_root_depth');
    expect(result.banderasCalidad).toContain('screening_water_balance');
    expect(result.advertencias.join(' ')).toContain(
      'fallback operativo conservador de 100 cm',
    );
  });

  it('usa la profundidad edafica fallback solo como techo de una raiz de cultivo', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'effective-depth-cap-test',
            estado: 'validado',
            profundidadRadicularCm: 150,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -33, lng: -61.9 },
      [dailyWithSoil('2026-07-10', { '0-100': 0.2, '100-200': 0.8 })],
      [],
      {
        loteId: '64b000000000000000000002',
        status: 'ready',
        stale: false,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'automatic_assessment',
        effectiveDepthCm: 100,
        effectiveDepthSource: 'operational_fallback',
        effectiveDepthConfidence: 'low',
        effectiveDepthIsFallback: true,
        confidence: 'low',
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 100,
            fieldCapacityPercentage: 30,
            wiltingPointPercentage: 10,
            source: 'soilgrids',
            confidence: 'low',
          },
          {
            depthFromCm: 100,
            depthToCm: 200,
            fieldCapacityPercentage: 50,
            wiltingPointPercentage: 10,
            source: 'soilgrids',
            confidence: 'low',
          },
        ],
        provenance: {},
      } as any,
    );

    expect(result.metricas.availableWaterCapacityMm).toBe(200);
    expect(result.metricas.rootZoneSoilMoistureM3M3).toBeCloseTo(0.2, 6);
    expect(result.banderasCalidad).toContain('screening_effective_soil_depth');
    expect(result.banderasCalidad).toContain('screening_water_balance');
    expect(result.advertencias.join(' ')).toContain(
      'se usa solo como techo del calculo',
    );
  });

  it('no informa TAW total cuando la cobertura hidraulica no alcanza la raiz objetivo', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'incomplete-profile-test',
            estado: 'validado',
            profundidadRadicularCm: 100,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        capacidadDeCampo: 30,
        puntoMarchitez: 10,
        suelos: [{ profundidad: 40, capacidadDeCampo: 30, puntoMarchitez: 10 }],
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
    );

    expect(result.metricas.availableWaterCapacityMm).toBeUndefined();
    expect(result.banderasCalidad).toContain('incomplete_hydraulic_root_zone');
    expect(result.advertencias.join(' ')).toContain(
      'No se extrapola la ultima capa',
    );
  });

  it('invalida el balance si FC y PMP abren un hueco dentro de la zona radicular', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'hydraulic-gap-test',
            estado: 'validado',
            profundidadRadicularCm: 90,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        suelos: [
          { profundidad: 30, capacidadDeCampo: 30, puntoMarchitez: 10 },
          { profundidad: 60, capacidadDeCampo: 10, puntoMarchitez: 10 },
          { profundidad: 100, capacidadDeCampo: 30, puntoMarchitez: 10 },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 8, 16, 24)],
    );

    expect(result.metricas.availableWaterCapacityMm).toBeUndefined();
    expect(result.banderasCalidad).toContain('incomplete_hydraulic_root_zone');
  });

  it('no interpreta un cero sin estado valido como agua util medida', () => {
    const baseSiembra = {
      _id: '64b000000000000000000001',
      idLote: '64b000000000000000000002',
      idEstablecimiento: '64b000000000000000000003',
      fechaSiembra: '2026-07-10',
      semilla: { cultivo: 'Soja' },
    } as any;
    const lote = {
      _id: '64b000000000000000000002',
      idEstablecimiento: '64b000000000000000000003',
      capacidadDeCampo: 30,
      puntoMarchitez: 12,
      sueloReferencia: { profundidadCm: 100 },
    } as any;
    const observations = [daily('2026-07-10', 8, 16, 24)];

    const [sinLectura] = engine.calculateIndicators(
      baseSiembra,
      lote,
      { lat: -33, lng: -61.9 },
      observations,
    );
    const [ceroNoDisponible] = engine.calculateIndicators(
      {
        ...baseSiembra,
        aguaUtilReal: 0,
        estadoCalculoAguaUtil: 'no_disponible',
      },
      lote,
      { lat: -33, lng: -61.9 },
      observations,
    );

    expect(ceroNoDisponible.metricas.soilWaterStorageMm).toBe(
      sinLectura.metricas.soilWaterStorageMm,
    );
    expect(ceroNoDisponible.advertencias.join(' ')).toContain(
      'no se interpreta un cero sin sensor como medicion',
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
      valores: {
        temperatureC,
        relativeHumidityPct: 75,
        precipitationMm: 0,
        soilTemperatureC: { '0-7': 11 + index, '7-28': 10 + index },
        soilMoistureM3M3: { '0-7': 0.22, '7-28': 0.2 },
      },
      fuente: 'open_meteo',
      fuentePorVariable: {
        temperatureC: 'open_meteo',
        relativeHumidityPct: 'open_meteo',
        precipitationMm: 'open_meteo',
        soilTemperatureC: 'open_meteo',
        soilMoistureM3M3: 'open_meteo',
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
        suelos: [
          {
            profundidad: 28,
            capacidadDeCampo: 30,
            puntoMarchitez: 12,
            hayRaices: true,
          },
        ],
      } as any,
      { lat: -33, lng: -61.9 },
      hourly,
    );
    expect(result.metricas.coldHours).toBe(1);
    expect(result.metricas.heatHours).toBe(1);
    expect(result.metricas.chillingHours).toBeUndefined();
    expect(result.metricas.vernalizationUnits).toBeUndefined();
    expect(result.advertencias.join(' ')).toContain(
      'La vernalizacion no se calcula',
    );
    expect(result.metricas.vpdMeanKpa).toBeUndefined();
    expect(result.metricas.relativeHumidityMeanPct).toBeUndefined();
    expect(result.banderasCalidad).toContain(
      'insufficient_hourly_humidity_coverage_for_daily_aggregate',
    );
    expect(result.advertencias.join(' ')).toContain(
      'No se publicaron minima, media ni maxima diaria de humedad',
    );
    expect(result.metricas.precipitationMm).toBeUndefined();
    expect(result.banderasCalidad).toContain(
      'insufficient_hourly_precipitation_coverage_for_daily_total',
    );
    expect(result.fuentePorVariable.soilMoistureM3M3).toBe(
      'derived_open_meteo',
    );
    expect(result.banderasCalidad).toContain('modeled_soil_open_meteo');
    expect(result.advertencias.join(' ')).toContain(
      'modelo de suelo Open-Meteo',
    );
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

  it('conserva la implantacion historica de perennes y abre la temporada de frio en mayo', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T18:00:00.000Z'));

    expect(
      engine.resolveCycleStart({
        fechaSiembra: '2020-08-15',
        semilla: { cultivo: 'Manzano' },
      } as any),
    ).toBe('2026-05-01');
    expect(
      engine.resolveCycleStart({
        fechaSiembra: '2026-05-10',
        semilla: { cultivo: 'Trigo' },
      } as any),
    ).toBe('2026-05-10');

    jest.useRealTimers();
  });

  it('incluye el frio previo a julio y no inventa forzado perenne sin biofix de campo', () => {
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
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
    ]);
    expect(results[0].metricas.gddAccumulated).toBeUndefined();
    expect(results[1].metricas.gddAccumulated).toBeUndefined();
    expect(results[2].metricas.gddAccumulated).toBeUndefined();
    expect(results[2].advertencias.join(' ')).toContain(
      'quedan bloqueados hasta registrar un biofix',
    );
    jest.useRealTimers();
  });

  it('no convierte un requisito legacy sin procedencia en cumplimiento varietal', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2020-08-15',
        semilla: {
          cultivo: 'Manzano',
          requerimientoFrio: {
            horasFrio: 900,
            horasFrioEfectivas: 738,
            porcionesFrio: 60,
            modelo: 'HF + HFE + CP',
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 2, 6, 10)],
    );

    expect(result.modeloFrioRector).toBe('sin_calibrar');
    expect(result.estadoRequerimientoFrio).toBe('requiere_calibracion');
    expect(result.objetivoFrioRector).toBeUndefined();
    expect(result.advertencias.join(' ')).toContain(
      'no declara cumplimiento biologico',
    );
  });

  it('compara solo el modelo rector validado y mantiene la etapa como confirmacion de campo', () => {
    const [result] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2020-08-15',
        semilla: {
          cultivo: 'Peral',
          requerimientoFrio: {
            horasFrio: 900,
            porcionesFrio: 52,
            modeloRector: 'HF',
            estado: 'validado',
            fuente: 'Ensayo varietal documentado',
            confianza: 'alta',
            protocoloTemporada: {
              version: 'alto-valle-hf-v1',
              estado: 'validado',
              fuente: 'Protocolo regional documentado',
              region: 'Alto Valle de Rio Negro y Neuquen',
              inicio: { tipo: 'fecha_calendario', mesDia: '05-01' },
              fin: { tipo: 'fecha_calendario', mesDia: '08-31' },
            },
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -33, lng: -61.9 },
      [daily('2026-07-10', 2, 6, 10)],
    );

    expect(result).toMatchObject({
      modeloFrioRector: 'HF',
      estadoRequerimientoFrio: 'validado',
      fuenteRequerimientoFrio: 'Ensayo varietal documentado',
      objetivoFrioRector: 900,
    });

    const summary = (engine as any).buildColdRequirementSummary({
      ...result,
      metricas: {
        ...result.metricas,
        chillingHoursAccumulated: 930,
        chillPortionsAccumulated: 70,
        chillingTemperatureCoveragePct: 100,
        chillingMaximumGapHours: 0,
        chillingContinuitySufficient: true,
      },
    });
    expect(summary).toMatchObject({
      model: 'HF',
      target: 900,
      accumulated: 930,
      compatible: true,
      coveragePercentage: 100,
      coverageSufficient: true,
      interpretation: 'compatible_requiere_confirmacion',
    });
  });

  it('hace prevalecer el biofix de campo sobre la fecha calendario del protocolo de frio', () => {
    const window = (engine as any).resolveColdSeasonWindow(
      {
        fechaSiembra: '2020-08-15',
        semilla: {
          cultivo: 'Peral',
          requerimientoFrio: {
            protocoloTemporada: {
              version: 'alto-valle-hf-v1',
              estado: 'validado',
              fuente: 'Protocolo regional documentado',
              region: 'Alto Valle de Rio Negro y Neuquen',
              inicio: { tipo: 'fecha_calendario', mesDia: '05-01' },
              fin: { tipo: 'biofix', objetivo: 'fin_acumulacion_frio' },
            },
          },
        },
        registrosFenologicos: [
          {
            id: 'inicio-frio-campo',
            tipoEvento: 'biofix',
            etapa: 'Inicio de dormancia',
            fechaInicioEtapa: '2026-05-18',
            objetivosBiofix: ['inicio_acumulacion_frio'],
            campania: '2025/2026',
          },
        ],
      },
      '2026-07-16',
    );

    expect(window).toMatchObject({
      start: '2026-05-18',
      comparisonReady: true,
      usedFallback: false,
    });
    expect(window.warnings.join(' ')).toContain('por biofix de campo');
  });

  it('usa el inicio observado de Dormancia sin exigir un objetivo varietal', () => {
    const window = (engine as any).resolveColdSeasonWindow(
      {
        _id: 'siembra-kiowa',
        idLote: 'lote-kiowa',
        fechaSiembra: '2020-01-01',
        semilla: { cultivo: 'Pecan', variedad: 'Kiowa' },
        registrosFenologicos: [
          {
            id: 'dormancia-observada',
            idSiembra: 'siembra-kiowa',
            idLote: 'lote-kiowa',
            cultivo: 'Pecan',
            tipoEvento: 'inicio_etapa',
            accion: 'inicio_etapa',
            etapa: 'Dormancia',
            fechaInicioEtapa: '2026-05-01',
            fechaObservacion: '2026-05-01',
            campania: '2026/2027',
          },
        ],
      },
      '2026-08-10',
    );

    expect(window).toMatchObject({
      start: '2026-05-01',
      comparisonReady: false,
      usedFallback: false,
    });
    expect(window.warnings.join(' ')).toContain(
      'inicio de dormancia registrado a campo',
    );
  });

  it('mantiene Dormancia del 1-may gobernando etapa y modelos Kc al cruzar el 1-jul', () => {
    const siembra = {
      _id: 'siembra-kiowa-etapa',
      idLote: 'lote-kiowa',
      fechaSiembra: '2020-01-01',
      semilla: { cultivo: 'Pecan', variedad: 'Kiowa' },
      registrosFenologicos: [
        {
          id: 'dormancia-observada',
          idSiembra: 'siembra-kiowa-etapa',
          idLote: 'lote-kiowa',
          cultivo: 'Pecan',
          tipoEvento: 'inicio_etapa',
          accion: 'inicio_etapa',
          etapa: 'Dormancia',
          fechaInicioEtapa: '2026-05-01',
          // Registro ya persistido con la frontera legacy del 1-jul.
          campania: '2025/2026',
          confianza: 'alta',
        },
      ],
    } as any;
    const etapas: Array<[string, number]> = [
      ['Dormancia', 0],
      ['Brotacion', 90],
    ];

    expect(
      (engine as any).resolveObservedStage(
        siembra,
        '2026-08-10',
        etapas,
      ),
    ).toBe('Dormancia');
    const provenance = (engine as any).resolveStageProvenance(
      siembra,
      '2026-08-10',
      0,
      {},
      {},
    );
    expect(provenance).toMatchObject({
      source: 'proyeccion_anclada_campo',
      confidence: 'media',
    });
    expect(
      (engine as any).stageCanDriveDecisionModels(siembra, provenance),
    ).toBe(true);
  });

  it('conserva el requisito validado sin bloquear sensores asignados por metadatos de calibracion', () => {
    const siembra = {
      _id: '64b000000000000000000001',
      idLote: '64b000000000000000000002',
      idEstablecimiento: '64b000000000000000000003',
      fechaSiembra: '2020-08-15',
      semilla: {
        cultivo: 'Peral',
        requerimientoFrio: {
          horasFrio: 900,
          modeloRector: 'HF',
          estado: 'validado',
          fuente: 'Ensayo varietal documentado',
          protocoloTemporada: {
            version: 'alto-valle-hf-v1',
            estado: 'validado',
            fuente: 'Protocolo regional documentado',
            region: 'Alto Valle de Rio Negro y Neuquen',
            inicio: { tipo: 'fecha_calendario', mesDia: '05-01' },
            fin: { tipo: 'fecha_calendario', mesDia: '08-31' },
          },
        },
      },
    } as any;
    const lote = {
      _id: '64b000000000000000000002',
      idEstablecimiento: '64b000000000000000000003',
    } as any;
    const observation = daily('2026-07-10', 2, 6, 10);
    const commonContext = {
      fieldCoverageByDate: new Map([['2026-07-10', 100]]),
      sensorNames: ['K-01'],
      lastFieldObservationAt: '2026-07-10T15:00:00.000Z',
      unqualifiedTemperatureSensorNames: ['K-01'],
    };

    const [unqualified] = engine.calculateIndicators(
      siembra,
      lote,
      { lat: -33, lng: -61.9 },
      [observation],
      [],
      undefined,
      {
        ...commonContext,
        fieldTemperatureDecisionReady: false,
      },
    );
    const [qualified] = engine.calculateIndicators(
      siembra,
      lote,
      { lat: -33, lng: -61.9 },
      [observation],
      [],
      undefined,
      {
        ...commonContext,
        fieldTemperatureDecisionReady: true,
        unqualifiedTemperatureSensorNames: [],
      },
    );

    expect(unqualified).toMatchObject({
      modeloFrioRector: 'HF',
      estadoRequerimientoFrio: 'validado',
      objetivoFrioRector: 900,
    });
    expect(unqualified.banderasCalidad).not.toContain(
      'unqualified_field_temperature_sensor',
    );
    expect(unqualified.advertencias.join(' ')).not.toMatch(
      /calificaci[oó]n meteorol[oó]gica|no habilitan cumplimiento varietal/i,
    );
    expect(qualified).toMatchObject({
      modeloFrioRector: 'HF',
      estadoRequerimientoFrio: 'validado',
      objetivoFrioRector: 900,
    });
    expect(qualified.banderasCalidad).not.toContain(
      'unqualified_field_temperature_sensor',
    );
  });

  it('informa el frio LoRa de campo como fuente prioritaria y mantiene su auditoria paralela', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-11T03:30:00.000Z'));
    try {
      const canonical = localHourlyTemperatureDay(
        '2026-07-10',
        20,
        'open_meteo',
      );
      const fieldReference = localHourlyTemperatureDay(
        '2026-07-10',
        5,
        'sensor',
      ).map((item) => ({
        ...item,
        estado: 'observed' as const,
        fuente: 'sensor' as const,
        fuentePorVariable: { temperatureC: 'sensor' as const },
        estadoPorVariable: { temperatureC: 'observed' as const },
        banderasCalidad: [
          'field_sensor',
          'temperature_sensor_quality:referencia',
          'sensor:K-01',
        ],
      }));
      const [indicator] = engine.calculateIndicators(
        {
          _id: '64b000000000000000000001',
          idLote: '64b000000000000000000002',
          idEstablecimiento: '64b000000000000000000003',
          fechaSiembra: '2020-08-15',
          semilla: {
            cultivo: 'Peral',
            parametrosAgrometeorologicos: {
              version: 'peral-field-cold-test',
              procesoTermico: 'dormancia_perenne',
              temperaturaBaseC: 4,
              temperaturaSuperiorC: 30,
            },
          },
        } as any,
        {
          _id: '64b000000000000000000002',
          idEstablecimiento: '64b000000000000000000003',
        } as any,
        { lat: -39, lng: -68 },
        canonical,
        [],
        undefined,
        {
          fieldObservations: fieldReference,
          fieldCoverageByDate: new Map([['2026-07-10', 100]]),
          sensorNames: ['K-01'],
          fieldTemperatureSensorNames: ['K-01'],
          lastFieldObservationAt: fieldReference[23].timestamp,
          fieldTemperatureDecisionReady: true,
          fieldTemperatureQuality: 'calificado',
          unqualifiedTemperatureSensorNames: [],
        },
      );

      expect(indicator.metricas.gddDaily).toBeUndefined();
      expect(indicator.metricas.gddAccumulated).toBeUndefined();
      expect(indicator.metricas.chillingHoursAccumulated).toBe(0);
      expect(indicator.metricas.fieldChillingHoursAccumulated).toBe(24);
      expect(indicator.calidadTemperaturaCampo).toBe('calificado');
      expect(indicator.nombresSensoresTemperaturaCampo).toEqual(['K-01']);
      expect(indicator.advertencias.join(' ')).toContain(
        'se integra como fuente prioritaria',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('no cambia de temporada fria porque el pronostico cruza el 1 de mayo', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-27T18:00:00.000Z'));
    const observed = daily('2026-04-27', 4, 8, 12);
    const forecast = daily('2026-05-04', 5, 9, 13);
    forecast.esPronostico = true;
    forecast.estado = 'forecast';
    forecast.estadoPorVariable = {
      temperatureMinC: 'forecast',
      temperatureMeanC: 'forecast',
      temperatureMaxC: 'forecast',
    };
    const results = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2020-08-15',
        semilla: {
          cultivo: 'Peral',
          parametrosAgrometeorologicos: {
            version: 'peral-test',
            procesoTermico: 'dormancia_perenne',
            temperaturaBaseC: 4,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -39, lng: -68 },
      [observed, forecast],
    );

    expect(results[0].inicioVentanaFrio).toBe('2025-05-01');
    expect(results[0].fecha).toBe('2026-04-27');
    jest.useRealTimers();
  });

  it('no activa GDD perenne por una fecha calendario ni por el horizonte futuro', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-25T18:00:00.000Z'));
    const observed = daily('2026-06-25', 10, 16, 22);
    const forecast = daily('2026-07-02', 11, 17, 23);
    forecast.esPronostico = true;
    forecast.estado = 'forecast';
    forecast.estadoPorVariable = {
      temperatureMinC: 'forecast',
      temperatureMeanC: 'forecast',
      temperatureMaxC: 'forecast',
    };
    const results = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2020-08-15',
        semilla: {
          cultivo: 'Peral',
          parametrosAgrometeorologicos: {
            version: 'peral-test',
            procesoTermico: 'dormancia_perenne',
            temperaturaBaseC: 4,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -39, lng: -68 },
      [observed, forecast],
    );

    expect(results[0].metricas.gddDaily).toBeUndefined();
    expect(results[0].metricas.gddAccumulated).toBeUndefined();
    jest.useRealTimers();
  });

  it('reconoce un biofix real de agosto-diciembre dentro de la campaña perenne', () => {
    const siembra = {
      fechaSiembra: '2020-08-15',
      semilla: { cultivo: 'Peral' },
      registrosFenologicos: [
        {
          id: 'inicio-forzado-campo',
          tipoEvento: 'biofix',
          etapa: 'Yema hinchada',
          fechaInicioEtapa: '2025-09-08',
          objetivosBiofix: ['inicio_forzado'],
          campania: '2025/2026',
        },
      ],
    } as any;

    expect((engine as any).resolveThermalStart(siembra, '2026-02-10')).toBe(
      '2025-09-08',
    );
  });

  it('resuelve el dia operativo en Argentina y no con la fecha UTC', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T01:30:00.000Z'));

    expect(
      engine.resolveCycleStart({
        fechaSiembra: '2020-08-15',
        semilla: { cultivo: 'Peral' },
      } as any),
    ).toBe('2025-05-01');
    jest.useRealTimers();
  });

  it('reinicia solo el GDD de la etapa por biofix y conserva el total', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-12T18:00:00.000Z'));
    const results = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-10',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'maiz-test',
            temperaturaBaseC: 10,
            temperaturaSuperiorC: 30,
          },
        },
        crono: { etapas: { Emergencia: 20, Vegetativo: 40 } },
        registrosFenologicos: [
          {
            id: 'reset-etapa',
            tipoEvento: 'biofix',
            etapa: 'Emergencia',
            fechaInicioEtapa: '2026-07-11',
            objetivosBiofix: ['reinicio_gdd_etapa'],
          },
        ],
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -33, lng: -61.9 },
      [
        daily('2026-07-10', 20, 20, 20),
        daily('2026-07-11', 20, 20, 20),
        daily('2026-07-12', 20, 20, 20),
      ],
    );

    expect(results.map((item) => item.metricas.gddAccumulated)).toEqual([
      10, 20, 30,
    ]);
    expect(results.map((item) => item.metricas.gddCurrentStage)).toEqual([
      10, 10, 20,
    ]);
    jest.useRealTimers();
  });

  it('acepta temperatura LoRa asignada aunque conserve una bandera legacy de referencia', () => {
    const date = '2026-07-10';
    const referenceHours = Array.from({ length: 24 }, (_, hour) => ({
      ...hourlyTemperature(date, hour, 30, 'sensor'),
      banderasCalidad: ['temperature_sensor_quality:referencia'],
    }));
    const qualifiedHours = referenceHours.map((item) => ({
      ...item,
      banderasCalidad: ['temperature_sensor_quality:calificado'],
    }));

    const reference = calculateTemperatureDay([
      daily(date, 8, 16, 24),
      ...referenceHours,
    ]);
    const qualified = calculateTemperatureDay([
      daily(date, 8, 16, 24),
      ...qualifiedHours,
    ]);

    expect(reference.metricas.temperatureMeanC).toBe(30);
    expect(reference.metricas.gddDaily).toBe(20);
    expect(qualified.metricas.temperatureMeanC).toBe(30);
    expect(qualified.metricas.gddDaily).toBe(20);
  });

  it('usa humedad y variables derivadas LoRa aunque conserven banderas legacy de referencia', () => {
    const date = '2026-07-10';
    const referenceHours = Array.from({ length: 24 }, (_, hour) => ({
      ...hourlyWeather(date, hour, {
        temperatureC: 18,
        relativeHumidityPct: 96,
      }),
      valores: {
        temperatureC: 18,
        relativeHumidityPct: 96,
        dewPointC: 17.5,
        vpdKpa: 2.8,
      },
      fuente: 'sensor' as const,
      fuentePorVariable: {
        temperatureC: 'sensor' as const,
        relativeHumidityPct: 'sensor' as const,
        dewPointC: 'sensor' as const,
        vpdKpa: 'sensor' as const,
      },
      estado: 'observed' as const,
      estadoPorVariable: {
        temperatureC: 'observed' as const,
        relativeHumidityPct: 'observed' as const,
        dewPointC: 'observed' as const,
        vpdKpa: 'observed' as const,
      },
      banderasCalidad: [
        'field_sensor',
        'temperature_sensor_quality:referencia',
        'humidity_sensor_quality:referencia',
      ],
    }));

    const result = calculateTemperatureDay(referenceHours);

    expect(result.metricas.relativeHumidityMinPct).toBe(96);
    expect(result.metricas.relativeHumidityMeanPct).toBe(96);
    expect(result.metricas.relativeHumidityMaxPct).toBe(96);
    expect(result.metricas.dewPointC).toBe(17.5);
    expect(result.metricas.vpdMeanKpa).toBeCloseTo(2.8, 6);
    expect(result.metricas.vpdMaxKpa).toBe(2.8);
    expect(result.metricas.vpdStressHours).toBe(24);
    expect(result.metricas.leafWetnessHours).toBe(24);
    expect(result.metricas.maxContinuousLeafWetnessHours).toBe(24);
    expect(result.metricas.meanTemperatureDuringLeafWetnessC).toBe(18);
  });

  it('incluye la brecha final hasta la ultima hora local cerrada', () => {
    const observations = localHourlyTemperatureDay('2026-07-11', 5);
    const series = (engine as any).calculateColdThermalSeries(
      observations,
      '2026-07-11',
      { procesoTermico: 'dormancia_perenne' },
      '2026-07-16T17:00:00.000Z',
    );

    expect(series.byDate.get('2026-07-16')).toMatchObject({
      hoursWithData: 0,
      dailyCoveragePct: 0,
    });
    expect(series.maximumGapHours).toBe(111);
    expect(series.continuitySufficient).toBe(false);
  });

  it('reinicia el precursor dinamico despues de una brecha en las series canonica y de campo', () => {
    const observations = [
      ...localHourlyTemperatureDay('2026-05-01', 6, 'sensor'),
      ...localHourlyTemperatureDay('2026-05-03', 6, 'sensor'),
    ];
    const parameters = {
      version: 'field-dynamic-gap-test',
      procesoTermico: 'dormancia_perenne',
    } as any;
    const canonical = (engine as any).calculateColdThermalSeries(
      observations,
      '2026-05-01',
      parameters,
      '2026-05-04T02:00:00.000Z',
      false,
    );
    const field = (engine as any).calculateColdThermalSeries(
      observations,
      '2026-05-01',
      parameters,
      '2026-05-04T02:00:00.000Z',
      true,
    );
    const total = (series: any) =>
      [...series.byDate.values()].reduce(
        (sum: number, day: any) => sum + (day.chillPortions || 0),
        0,
      );

    expect(total(canonical)).toBe(0);
    expect(total(field)).toBe(0);
    expect(canonical.warnings.join(' ')).toContain(
      'cota inferior conservadora',
    );
    expect(field.warnings.join(' ')).toContain('cota inferior conservadora');
  });

  it('no suma frio pronosticado dentro del acumulado observado', () => {
    const observed = localHourlyTemperatureDay('2026-07-11', 5);
    const forecast = localHourlyTemperatureDay('2026-07-12', 5).map((item) => ({
      ...item,
      estado: 'forecast' as const,
      esPronostico: true,
      estadoPorVariable: { temperatureC: 'forecast' as const },
    }));
    const series = (engine as any).calculateColdThermalSeries(
      [...observed, ...forecast],
      '2026-07-11',
      { procesoTermico: 'dormancia_perenne' },
      '2026-07-13T02:00:00.000Z',
    );

    expect(series.byDate.get('2026-07-11')?.chillingHours).toBe(24);
    expect(series.byDate.get('2026-07-12')).toMatchObject({
      hoursWithData: 0,
      chillingHours: undefined,
    });
  });

  it('marca forecast si cualquier fuente horaria usada es pronostico', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-10T18:00:00.000Z'));
    const forecastHour = hourlyWeather('2026-07-10', 12, {
      precipitationMm: 1,
    });
    forecastHour.estado = 'forecast';
    forecastHour.esPronostico = true;
    forecastHour.estadoPorVariable = { precipitationMm: 'forecast' };
    const result = calculateTemperatureDay([
      daily('2026-07-10', 8, 16, 24),
      forecastHour,
    ]);

    expect(result.esPronostico).toBe(true);
    jest.useRealTimers();
  });

  it('bloquea la compatibilidad varietal cuando la cobertura termica acumulada es insuficiente', () => {
    const summary = (engine as any).buildColdRequirementSummary({
      modeloFrioRector: 'HF',
      estadoRequerimientoFrio: 'validado',
      fuenteRequerimientoFrio: 'Ensayo varietal documentado',
      objetivoFrioRector: 900,
      metricas: {
        chillingHoursAccumulated: 930,
        chillingTemperatureCoveragePct: 49.5,
        chillingMaximumGapHours: 0,
        chillingContinuitySufficient: true,
      },
    });

    expect(summary).toMatchObject({
      model: 'HF',
      target: 900,
      accumulated: 930,
      coveragePercentage: 49.5,
      minimumCoveragePercentage: 75,
      coverageSufficient: false,
      interpretation: 'datos_insuficientes',
    });
    expect(summary.progressPercentage).toBeUndefined();
    expect(summary.compatible).toBeUndefined();
  });

  it('bloquea compatibilidad cuando existe una brecha continua larga aunque la cobertura global sea alta', () => {
    const summary = (engine as any).buildColdRequirementSummary({
      modeloFrioRector: 'CP',
      estadoRequerimientoFrio: 'validado',
      fuenteRequerimientoFrio: 'Ensayo varietal documentado',
      objetivoFrioRector: 50,
      metricas: {
        chillPortionsAccumulated: 55,
        chillingTemperatureCoveragePct: 96,
        chillingMaximumGapHours: 18,
        chillingContinuitySufficient: false,
      },
    });

    expect(summary).toMatchObject({
      model: 'CP',
      coverageSufficient: true,
      maximumGapHours: 18,
      maximumAllowedGapHours: 6,
      continuitySufficient: false,
      interpretation: 'datos_insuficientes',
    });
    expect(summary.progressPercentage).toBeUndefined();
    expect(summary.compatible).toBeUndefined();
  });

  it('propaga cobertura acumulada de temporada y no solo la cobertura del ultimo dia', () => {
    const observations: IObservacionMeteorologicaNormalizada[] = [];
    const addHour = (timestamp: string, fechaLocal: string) => {
      observations.push({
        idEstablecimiento: '64b000000000000000000003',
        timestamp,
        fechaLocal,
        timezone: 'America/Argentina/Buenos_Aires',
        granularidad: 'hourly',
        estado: 'observed',
        esPronostico: false,
        valores: { temperatureC: 5 },
        fuente: 'sensor',
        fuentePorVariable: { temperatureC: 'sensor' },
        banderasCalidad: [],
        completitudPct: 100,
        obtenidoEn: timestamp,
      });
    };

    for (let hour = 0; hour < 12; hour += 1) {
      addHour(
        new Date(Date.UTC(2026, 4, 1, hour + 3)).toISOString(),
        '2026-05-01',
      );
    }
    for (let hour = 0; hour < 24; hour += 1) {
      addHour(
        new Date(Date.UTC(2026, 4, 2, hour + 3)).toISOString(),
        '2026-05-02',
      );
    }

    const series = (engine as any).calculateColdThermalSeries(
      observations,
      '2026-05-01',
      { procesoTermico: 'dormancia_perenne' },
    );

    expect(series.byDate.get('2026-05-01')).toMatchObject({
      dailyCoveragePct: 50,
      coveragePct: 50,
    });
    expect(series.byDate.get('2026-05-02')).toMatchObject({
      dailyCoveragePct: 100,
      coveragePct: 75,
    });
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

  it('no eleva a GDD validado un perfil termico varietal incompleto y deja prevalecer campo', () => {
    const parameters = {
      version: 'trigo-gdd-validado-v1',
      estado: 'validado',
      fuente: 'Ensayo fenologico varietal trazable',
      metodoGdd: 'promedio_limitado',
      semanticaGddPorEtapa: 'rangos_acumulados_desde_inicio_termico',
      gddPorEtapa: {
        Siembra: { orden: 1, min: 0, max: 79 },
        Emergencia: { orden: 2, min: 80, max: 249 },
        Macollaje: { orden: 3, min: 250, max: 499 },
        'Hoja Bandera': { orden: 4, min: 500, max: 700 },
      },
    };
    const siembra = {
      fechaSiembra: '2026-05-01',
      semilla: { cultivo: 'Trigo' },
    } as any;

    expect((engine as any).resolveValidatedGddStage(parameters, 320)).toBe(
      'Macollaje',
    );

    expect(
      (engine as any).resolveStage(siembra, '2026-07-10', 320, parameters),
    ).toBe('Ciclo en seguimiento');

    siembra.registrosFenologicos = [
      {
        id: 'observacion-campo',
        tipoEvento: 'observacion',
        accion: 'observacion',
        etapa: 'Hoja Bandera',
        fechaObservacion: '2026-07-10',
        campania: '2026/2027',
      },
    ];
    expect(
      (engine as any).resolveStage(siembra, '2026-07-10', 320, parameters),
    ).toBe('Hoja Bandera');
  });

  it('publica en Arveja la misma etapa termica de referencia que muestra la tarjeta fenologica', () => {
    const siembra = {
      fechaSiembra: '2026-07-01',
      semilla: {
        cultivo: 'Arveja',
        fenologiaReferencia: {
          rangosTermicos: {
            'S-E': { min: 125, max: 140 },
            'E-R1': { min: 685, max: 760 },
            'R1-MF': { min: 585, max: 660 },
            'S-MF': { min: 1395, max: 1560 },
          },
        },
      },
    } as any;

    expect((engine as any).resolveStage(siembra, '2026-07-17', 145.5)).toBe(
      'E - Emergencia y desarrollo vegetativo',
    );
    expect(
      (engine as any).resolveStageProvenance(siembra, '2026-07-17', 145.5, {}),
    ).toEqual({
      source: 'rango_termico_referencia',
      confidence: 'referencia',
    });
  });

  it('conserva el GDD crudo pero no deja que un cereal invernal cruce la fase sensible sin vernalizacion suficiente', () => {
    const parameters = {
      version: 'trigo-gate-conservador-v1',
      estado: 'validado',
      fuente: 'Ensayo fenologico varietal trazable',
      procesoTermico: 'vernalizacion_anual',
      metodoGdd: 'promedio_limitado',
      semanticaGddPorEtapa: 'rangos_acumulados_desde_inicio_termico',
      temperaturaBaseC: 0,
      temperaturaSuperiorC: 26,
      gddPorEtapa: {
        Siembra: { orden: 1, min: 0 },
        Emergencia: { orden: 2, min: 80 },
        Macollaje: { orden: 3, min: 250 },
        'Espiguilla Terminal': { orden: 4, min: 400 },
        'Hoja Bandera': { orden: 5, min: 500 },
      },
      modeloVernalizacion: 'ventana_calibrada',
      habitoVernalizacion: 'invernal',
      estadoVernalizacion: 'validado',
      fuenteVernalizacion: 'Ensayo varietal local trazable',
      rangoVernalizacionC: { min: 0, max: 10 },
      requerimientoVernalizacion: 45,
      ventanaVernalizacion: {
        inicioEtapa: 'Emergencia',
        finEtapa: 'Espiguilla Terminal',
        unidad: 'dias_equivalentes',
      },
    } as any;
    const siembra = {
      fechaSiembra: '2026-05-01',
      semilla: {
        cultivo: 'Trigo',
        variedad: 'Trigo invernal validado',
        parametrosAgrometeorologicos: {
          ...parameters,
          fotoperiodoVarietal: {
            modelo: 'umbral_por_etapa',
            estado: 'validado',
            fuente: 'Ensayo fotoperiodico varietal trazable',
            porEtapa: {
              'Hoja Bandera': { respuesta: 'neutra' },
            },
          },
        },
      },
    } as any;

    expect(
      (engine as any).resolveStage(siembra, '2026-07-10', 550, parameters, {
        vernalizationAccumulated: 30,
        vernalizationCoverageSufficient: true,
        vernalizationContinuitySufficient: true,
        photoperiodHours: 11,
      }),
    ).toBe('Macollaje');
    expect(
      (engine as any).resolveThermalStageGate(parameters, 550, {
        vernalizationAccumulated: 30,
        vernalizationCoverageSufficient: true,
        vernalizationContinuitySufficient: true,
        photoperiodHours: 11,
      }),
    ).toBe('vernalizacion_pendiente');

    expect(
      (engine as any).resolveStage(siembra, '2026-07-10', 550, parameters, {
        vernalizationAccumulated: 45,
        vernalizationCoverageSufficient: true,
        vernalizationContinuitySufficient: true,
        photoperiodHours: 11,
      }),
    ).toBe('Hoja Bandera');
  });

  it('acepta requisito cero documentado para cereal primaveral sin inventar ventana de vernalizacion', () => {
    const parameters = {
      version: 'trigo-primaveral-v1',
      estado: 'validado',
      fuente: 'Ensayo fenologico varietal trazable',
      procesoTermico: 'vernalizacion_anual',
      metodoGdd: 'promedio_limitado',
      semanticaGddPorEtapa: 'rangos_acumulados_desde_inicio_termico',
      temperaturaBaseC: 0,
      temperaturaSuperiorC: 26,
      gddPorEtapa: {
        Siembra: { orden: 1, min: 0 },
        Emergencia: { orden: 2, min: 80 },
        Macollaje: { orden: 3, min: 250 },
        'Hoja Bandera': { orden: 4, min: 500 },
      },
      habitoVernalizacion: 'primaveral',
      estadoVernalizacion: 'validado',
      fuenteVernalizacion: 'Caracterizacion varietal trazable',
      requerimientoVernalizacion: 0,
    } as any;

    expect((engine as any).hasCalibratedVernalization(parameters)).toBe(true);
    expect((engine as any).requiresVernalizationGate(parameters)).toBe(false);
    expect(
      (engine as any).resolveValidatedGddStage(parameters, 550, {
        photoperiodHours: 11,
      }),
    ).toBe('Hoja Bandera');
  });

  it('no usa el calendario perenne para Kc ni ETc hasta registrar fenologia a campo', () => {
    const [referenceOnly] = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2020-08-15',
        semilla: {
          cultivo: 'Manzano',
          parametrosAgrometeorologicos: {
            version: 'manzano-field-stage-v1',
            estado: 'validado',
            fuente: 'Protocolo varietal trazable',
            procesoTermico: 'dormancia_perenne',
            temperaturaBaseC: 4,
            temperaturaSuperiorC: 30,
            kcInicial: 0.3,
            kcMedio: 1,
            kcFinal: 0.5,
            kcPorEtapa: { Brotacion: 0.65 },
          },
        },
        crono: { etapas: { Brotacion: 0, Floracion: 30 } },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -39, lng: -68 },
      [daily('2026-07-10', 2, 8, 14)],
    );

    expect(referenceOnly.fuenteEtapaFenologica).toBe('cronograma_referencia');
    expect(referenceOnly.metricas.kc).toBeUndefined();
    expect(referenceOnly.metricas.etcMm).toBeUndefined();
    expect(referenceOnly.advertencias.join(' ')).toContain(
      'no gobierna Kc, ETc',
    );
  });

  it('mantiene la compuerta de vernalizacion cerrada si la cobertura o continuidad no alcanzan', () => {
    const parameters = {
      version: 'cebada-gate-conservador-v1',
      estado: 'validado',
      fuente: 'Ensayo fenologico varietal trazable',
      procesoTermico: 'vernalizacion_anual',
      metodoGdd: 'promedio_limitado',
      semanticaGddPorEtapa: 'rangos_acumulados_desde_inicio_termico',
      gddPorEtapa: {
        Siembra: { orden: 1, min: 0 },
        Emergencia: { orden: 2, min: 80 },
        Macollaje: { orden: 3, min: 250 },
        'Espiguilla Terminal': { orden: 4, min: 400 },
        'Hoja Bandera': { orden: 5, min: 500 },
      },
      modeloVernalizacion: 'ventana_calibrada',
      habitoVernalizacion: 'facultativo',
      estadoVernalizacion: 'validado',
      fuenteVernalizacion: 'Ensayo varietal local trazable',
      rangoVernalizacionC: { min: 0, max: 10 },
      requerimientoVernalizacion: 20,
      ventanaVernalizacion: {
        inicioEtapa: 'Emergencia',
        finEtapa: 'Espiguilla Terminal',
        unidad: 'dias_equivalentes',
      },
    } as any;

    expect(
      (engine as any).resolveValidatedGddStage(parameters, 550, {
        vernalizationAccumulated: 25,
        vernalizationCoverageSufficient: false,
        vernalizationContinuitySufficient: true,
      }),
    ).toBe('Macollaje');
    expect(
      (engine as any).resolveValidatedGddStage(parameters, 550, {
        vernalizationAccumulated: 25,
        vernalizationCoverageSufficient: true,
        vernalizationContinuitySufficient: false,
      }),
    ).toBe('Macollaje');
  });

  it('no declara etapa termica automatica en cereal invernal sin perfil de vernalizacion validado y deja prevalecer campo', () => {
    const parameters = {
      version: 'trigo-sin-calibrar-v1',
      estado: 'validado',
      fuente: 'Ensayo fenologico varietal trazable',
      procesoTermico: 'vernalizacion_anual',
      metodoGdd: 'promedio_limitado',
      semanticaGddPorEtapa: 'rangos_acumulados_desde_inicio_termico',
      gddPorEtapa: {
        Siembra: { orden: 1, min: 0 },
        Emergencia: { orden: 2, min: 80 },
        Macollaje: { orden: 3, min: 250 },
        'Hoja Bandera': { orden: 4, min: 500 },
      },
      habitoVernalizacion: 'invernal',
      estadoVernalizacion: 'requiere_calibracion',
    } as any;
    const siembra = {
      fechaSiembra: '2026-05-01',
      semilla: { cultivo: 'Trigo' },
    } as any;

    expect(
      (engine as any).resolveStage(siembra, '2026-07-10', 550, parameters),
    ).toBe('Ciclo en seguimiento');
    expect((engine as any).resolveThermalStageGate(parameters, 550, {})).toBe(
      'vernalizacion_sin_calibrar',
    );

    siembra.registrosFenologicos = [
      {
        id: 'observacion-campo',
        tipoEvento: 'observacion',
        accion: 'observacion',
        etapa: 'Hoja Bandera',
        fechaObservacion: '2026-07-10',
        campania: '2026/2027',
      },
    ];
    expect(
      (engine as any).resolveStage(siembra, '2026-07-10', 550, parameters),
    ).toBe('Hoja Bandera');
  });

  it('aplica un umbral fotoperiodico varietal validado sin atribuirlo a variedades sin fuente', () => {
    const parameters = {
      version: 'soja-fotoperiodo-validado-v1',
      estado: 'validado',
      fuente: 'Ensayo fenologico varietal trazable',
      procesoTermico: 'termico_fotoperiodico',
      metodoGdd: 'promedio_limitado',
      semanticaGddPorEtapa: 'rangos_acumulados_desde_inicio_termico',
      gddPorEtapa: {
        Siembra: { orden: 1, min: 0 },
        Emergencia: { orden: 2, min: 80 },
        Vegetativo: { orden: 3, min: 250 },
        Floracion: { orden: 4, min: 500 },
      },
      fotoperiodoVarietal: {
        modelo: 'umbral_por_etapa',
        estado: 'validado',
        fuente: 'Ensayo local por variedad',
        porEtapa: {
          Floracion: { respuesta: 'dia_corto', umbralHoras: 13 },
        },
      },
    } as any;

    expect(
      (engine as any).resolveValidatedGddStage(parameters, 550, {
        photoperiodHours: 14,
      }),
    ).toBe('Vegetativo');
    expect(
      (engine as any).resolveThermalStageGate(parameters, 550, {
        photoperiodHours: 14,
      }),
    ).toBe('fotoperiodo_incompatible');
    expect(
      (engine as any).resolveValidatedGddStage(parameters, 550, {
        photoperiodHours: 12.5,
      }),
    ).toBe('Floracion');
  });

  it('valida el fotoperiodo en secuencia y no salta una etapa intermedia incompatible', () => {
    const parameters = {
      version: 'soja-fotoperiodo-secuencial-v1',
      estado: 'validado',
      fuente: 'Ensayo fenologico varietal trazable',
      procesoTermico: 'termico_fotoperiodico',
      metodoGdd: 'promedio_limitado',
      semanticaGddPorEtapa: 'rangos_acumulados_desde_inicio_termico',
      gddPorEtapa: {
        Siembra: { orden: 1, min: 0 },
        Emergencia: { orden: 2, min: 80 },
        Vegetativo: { orden: 3, min: 250 },
        Floracion: { orden: 4, min: 500 },
        Fructificacion: { orden: 5, min: 650 },
      },
      fotoperiodoVarietal: {
        modelo: 'umbral_por_etapa',
        estado: 'validado',
        fuente: 'Ensayo local por variedad',
        porEtapa: {
          Vegetativo: { respuesta: 'dia_corto', umbralHoras: 13 },
          Floracion: { respuesta: 'dia_largo', umbralHoras: 13.5 },
          Fructificacion: { respuesta: 'neutra' },
        },
      },
    } as any;

    expect(
      (engine as any).resolveValidatedGddStage(parameters, 700, {
        photoperiodHours: 14,
      }),
    ).toBe('Emergencia');
    expect(
      (engine as any).resolveThermalStageGate(parameters, 700, {
        photoperiodHours: 14,
      }),
    ).toBe('fotoperiodo_incompatible');
  });

  it('retrocede hasta la ultima etapa compatible cuando varias etapas consecutivas bloquean por fotoperiodo', () => {
    const parameters = {
      version: 'soja-fotoperiodo-retroceso-v1',
      estado: 'validado',
      fuente: 'Ensayo fenologico varietal trazable',
      procesoTermico: 'termico_fotoperiodico',
      metodoGdd: 'promedio_limitado',
      semanticaGddPorEtapa: 'rangos_acumulados_desde_inicio_termico',
      gddPorEtapa: {
        Siembra: { orden: 1, min: 0 },
        Emergencia: { orden: 2, min: 80 },
        Vegetativo: { orden: 3, min: 250 },
        Floracion: { orden: 4, min: 500 },
      },
      fotoperiodoVarietal: {
        modelo: 'umbral_por_etapa',
        estado: 'validado',
        fuente: 'Ensayo local por variedad',
        porEtapa: {
          Vegetativo: { respuesta: 'dia_corto', umbralHoras: 13 },
          Floracion: { respuesta: 'dia_corto', umbralHoras: 13 },
        },
      },
    } as any;

    expect(
      (engine as any).resolveValidatedGddStage(parameters, 550, {
        photoperiodHours: 14,
      }),
    ).toBe('Emergencia');
  });

  it('persiste la procedencia de la etapa para distinguir campo, GDD validado y cronograma de referencia', () => {
    const parameters = {
      version: 'maiz-gdd-validado-v1',
      estado: 'validado',
      fuente: 'Ensayo fenologico varietal trazable',
      procesoTermico: 'termico',
      metodoGdd: 'promedio_limitado',
      semanticaGddPorEtapa: 'rangos_acumulados_desde_inicio_termico',
      gddPorEtapa: {
        Siembra: { orden: 1, min: 0 },
        Emergencia: { orden: 2, min: 80 },
      },
    } as any;
    const siembra = {
      fechaSiembra: '2026-05-01',
      semilla: {
        cultivo: 'Maiz',
        variedad: 'Hibrido termico validado',
        parametrosAgrometeorologicos: {
          ...parameters,
          temperaturaBaseC: 10,
          temperaturaSuperiorC: 30,
          procesoTermico: 'termico_fotoperiodico',
          fotoperiodoVarietal: {
            modelo: 'umbral_por_etapa',
            estado: 'validado',
            fuente: 'Ensayo fotoperiodico varietal trazable',
            porEtapa: {
              Emergencia: { respuesta: 'neutra' },
            },
          },
        },
      },
      crono: { etapas: { Siembra: 10, Emergencia: 30 } },
    } as any;

    expect(
      (engine as any).resolveStageProvenance(
        siembra,
        '2026-05-20',
        100,
        parameters,
        {},
      ),
    ).toEqual({
      source: 'gdd_validado',
      confidence: 'media',
      modelVersion: 'maiz-gdd-validado-v1',
    });

    expect(
      (engine as any).resolveStageProvenance(
        siembra,
        '2026-05-20',
        Number.NaN,
        parameters,
        {},
      ),
    ).toEqual({
      source: 'cronograma_referencia',
      confidence: 'referencia',
    });

    siembra.registrosFenologicos = [
      {
        id: 'observacion-campo',
        tipoEvento: 'observacion',
        accion: 'observacion',
        etapa: 'Emergencia',
        fechaObservacion: '2026-05-20',
        campania: '2026/2027',
      },
    ];
    expect(
      (engine as any).resolveStageProvenance(
        siembra,
        '2026-05-20',
        100,
        parameters,
        {},
      ),
    ).toEqual({
      source: 'campo',
      confidence: 'alta',
      modelVersion: 'observacion-campo-v1',
    });

    siembra.registrosFenologicos = [
      {
        id: 'inicio-etapa-campo',
        tipoEvento: 'inicio_etapa',
        etapa: 'Emergencia',
        fechaInicioEtapa: '2026-05-10',
        campania: '2026/2027',
      },
    ];
    expect(
      (engine as any).resolveStageProvenance(
        siembra,
        '2026-05-10',
        100,
        parameters,
        {},
      ),
    ).toEqual({
      source: 'campo',
      confidence: 'alta',
      modelVersion: 'inicio-etapa-campo-v1',
    });
    expect(
      (engine as any).resolveStageProvenance(
        siembra,
        '2026-05-20',
        100,
        parameters,
        {},
      ),
    ).toEqual({
      source: 'proyeccion_anclada_campo',
      confidence: 'media',
      modelVersion: 'cronograma-anclado-campo-v1',
    });
  });

  it.each([
    {
      caso: 'confianza baja explicita',
      confianza: 'baja',
      coberturaObservadaPct: 80,
    },
    {
      caso: 'cobertura observada nula',
      confianza: 'alta',
      coberturaObservadaPct: 0,
    },
  ])(
    'mantiene visible la etapa con $caso pero no deja que gobierne decisiones',
    ({ confianza, coberturaObservadaPct }) => {
      const siembra = {
        fechaSiembra: '2026-05-01',
        semilla: { cultivo: 'Maiz' },
        registrosFenologicos: [
          {
            id: 'observacion-campo-referencia',
            tipoEvento: 'observacion',
            accion: 'observacion',
            etapa: 'Emergencia',
            fechaObservacion: '2026-05-20',
            campania: '2026/2027',
            confianza,
            coberturaObservadaPct,
          },
        ],
      } as any;

      expect(
        (engine as any).resolveStage(siembra, '2026-05-20', 100, {
          version: 'perfil-incompleto',
        }),
      ).toBe('Emergencia');
      const provenance = (engine as any).resolveStageProvenance(
        siembra,
        '2026-05-20',
        100,
        { version: 'perfil-incompleto' },
        {},
      );
      expect(provenance).toEqual({
        source: 'campo',
        confidence: 'referencia',
        modelVersion: 'observacion-campo-v1',
      });
      expect(
        (engine as any).stageCanDriveDecisionModels(siembra, provenance),
      ).toBe(false);
    },
  );

  it('ordena cronologicamente la respuesta aunque el repositorio entregue filas mezcladas', async () => {
    const getIndicadores = jest.fn().mockResolvedValue({
      datos: [
        {
          idSiembra: '64b000000000000000000001',
          idEstablecimiento: '64b000000000000000000003',
          fecha: '2026-07-03',
          etapaFenologica: 'Emergencia',
          metricas: {
            gddAccumulated: 30,
            gddBaseTemperatureC: 0,
            gddUpperTemperatureC: 26,
          },
          fuente: 'open_meteo',
          fuentePorVariable: {},
          banderasCalidad: [],
          advertencias: [],
          completitudPct: 100,
          esPronostico: false,
          procesoTermico: 'vernalizacion_anual',
          estadoParametros: 'requiere_calibracion',
          fuenteParametros: 'APSIM; calibrar por variedad',
          habitoVernalizacion: 'desconocido',
          calculadoEn: '2026-07-03T18:00:00.000Z',
          versionParametros: 'test-v1',
        },
        {
          idSiembra: '64b000000000000000000001',
          idEstablecimiento: '64b000000000000000000003',
          fecha: '2026-07-01',
          etapaFenologica: 'Siembra',
          metricas: { gddAccumulated: 10 },
          fuente: 'open_meteo',
          fuentePorVariable: {},
          banderasCalidad: [],
          advertencias: [],
          completitudPct: 100,
          esPronostico: false,
          calculadoEn: '2026-07-01T18:00:00.000Z',
          versionParametros: 'test-v1',
        },
        {
          idSiembra: '64b000000000000000000001',
          idEstablecimiento: '64b000000000000000000003',
          fecha: '2026-07-02',
          etapaFenologica: 'Emergencia',
          metricas: { gddAccumulated: 20 },
          fuente: 'open_meteo',
          fuentePorVariable: {},
          banderasCalidad: [],
          advertencias: [],
          completitudPct: 100,
          esPronostico: false,
          calculadoEn: '2026-07-02T18:00:00.000Z',
          versionParametros: 'test-v1',
        },
      ],
    });
    const service = new AgrometeorologicalEngineService(
      {
        getIndicadores,
        getObservaciones: jest.fn().mockResolvedValue({ datos: [] }),
      } as any,
      {} as any,
    );

    const response = await service.getResponse('64b000000000000000000001');

    expect(response.series.map((item) => item.date)).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ]);
    expect(getIndicadores.mock.calls[0][0].sort).toBe('fecha');
    expect(JSON.parse(getIndicadores.mock.calls[0][0].filter)).toMatchObject({
      idSiembra: '64b000000000000000000001',
      versionCalculo: 'agromet-1.1.1',
    });
    expect(response.summary.gddThroughDate).toBe('2026-07-03');
    expect(response.summary.gddBaseTemperatureC).toBe(0);
    expect(response.summary.gddUpperTemperatureC).toBe(26);
    expect(response.summary.thermalProcess).toBe('vernalizacion_anual');
    expect(response.summary.parametersStatus).toBe('requiere_calibracion');
    expect(response.summary.vernalizationHabit).toBe('desconocido');
  });

  it('respeta from/to tambien cuando lee una generacion activa', async () => {
    const indicator = (date: string, gdd: number) =>
      ({
        idSiembra: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fecha: date,
        metricas: { gddAccumulated: gdd },
        fuente: 'open_meteo',
        fuentePorVariable: {},
        banderasCalidad: [],
        advertencias: [],
        completitudPct: 100,
        esPronostico: false,
        calculadoEn: `${date}T18:00:00.000Z`,
        versionParametros: 'test-v1',
      }) as any;
    const getIndicadores = jest.fn().mockResolvedValue({ datos: [] });
    const service = new AgrometeorologicalEngineService(
      {
        getActiveIndicadoresGeneration: jest.fn().mockResolvedValue({
          generationId: 'generation-active',
          data: [
            indicator('2026-07-01', 10),
            indicator('2026-07-02', 20),
            indicator('2026-07-03', 30),
          ],
        }),
        getIndicadores,
        getObservaciones: jest.fn().mockResolvedValue({ datos: [] }),
      } as any,
      {} as any,
    );

    const response = await service.getResponse(
      '64b000000000000000000001',
      '2026-07-02',
      '2026-07-02',
    );

    expect(response.series.map((item) => item.date)).toEqual(['2026-07-02']);
    expect(getIndicadores).not.toHaveBeenCalled();
  });

  it('conserva la version estable anterior durante el cutover sin mezclar versiones', async () => {
    const getIndicadores = jest.fn().mockResolvedValueOnce({
      datos: [
        {
          idSiembra: '64b000000000000000000001',
          idLote: '64b000000000000000000002',
          idEstablecimiento: '64b000000000000000000003',
          fecha: '2026-07-01',
          metricas: { gddAccumulated: 10 },
          fuente: 'open_meteo',
          fuentePorVariable: {},
          banderasCalidad: [],
          advertencias: [],
          completitudPct: 100,
          esPronostico: false,
          calculadoEn: '2026-07-01T18:00:00.000Z',
          versionParametros: 'legacy-parameters',
        },
      ],
    });
    const service = new AgrometeorologicalEngineService(
      {
        getIndicadores,
        getObservaciones: jest.fn().mockResolvedValue({ datos: [] }),
      } as any,
      {} as any,
    );

    const response = await service.getResponse('64b000000000000000000001');

    expect(response.calculationVersion).toBe('agromet-1.1.1');
    expect(response.warnings).toContain(
      'Se conserva temporalmente la ultima serie meteorologica estable mientras finaliza el reproceso del motor actualizado.',
    );
    expect(
      JSON.parse(getIndicadores.mock.calls[0][0].filter).versionCalculo,
    ).toBe('agromet-1.1.1');
  });

  it('materializa cada fecha del intervalo esperado para no activar una serie truncada', () => {
    const results = engine.calculateIndicators(
      {
        _id: '64b000000000000000000001',
        idLote: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
        fechaSiembra: '2026-07-01',
        semilla: {
          cultivo: 'Maiz',
          parametrosAgrometeorologicos: {
            version: 'interval-test-v1',
            temperaturaBaseC: 10,
          },
        },
      } as any,
      {
        _id: '64b000000000000000000002',
        idEstablecimiento: '64b000000000000000000003',
      } as any,
      { lat: -39, lng: -68 } as any,
      [daily('2026-07-01', 8, 14, 20), daily('2026-07-03', 9, 15, 21)],
      [],
      undefined,
      undefined,
      '2026-07-03',
    );

    expect(results.map((item) => item.fecha)).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ]);
    expect(results[1].completitudPct).toBe(11.1);
    expect(results[1].metricas.temperatureMeanC).toBeUndefined();
  });

  it('normaliza como operativo el frio LoRa persistido con una etiqueta legacy de referencia', async () => {
    const service = new AgrometeorologicalEngineService(
      {
        getIndicadores: jest.fn().mockResolvedValue({
          datos: [
            {
              idSiembra: '64b000000000000000000001',
              idLote: '64b000000000000000000002',
              idEstablecimiento: '64b000000000000000000003',
              fecha: '2026-07-10',
              metricas: {
                fieldChillingHoursAccumulated: 240,
                fieldUtahChillUnitsAccumulated: 315.5,
                fieldChillPortionsAccumulated: 18.25,
                fieldChillingTemperatureCoveragePct: 68,
                fieldChillingMaximumGapHours: 96,
                fieldChillingContinuitySufficient: false,
              },
              fuente: 'open_meteo',
              fuentePorVariable: { temperatureMeanC: 'open_meteo' },
              banderasCalidad: [],
              advertencias: [],
              completitudPct: 90,
              coberturaCampoPct: 68,
              ultimaObservacionCampo: '2026-07-10T22:00:00.000Z',
              calidadTemperaturaCampo: 'referencia',
              nombresSensoresTemperaturaCampo: ['K-01'],
              procesoTermico: 'dormancia_perenne',
              esPronostico: false,
              calculadoEn: '2026-07-10T23:00:00.000Z',
              versionParametros: 'test-v1',
            },
          ],
        }),
        getObservaciones: jest.fn().mockResolvedValue({ datos: [] }),
      } as any,
      {} as any,
    );

    const response = await service.getResponse('64b000000000000000000001');

    expect(response.summary.fieldCold).toEqual(
      expect.objectContaining({
        quality: 'qualified',
        sensorNames: ['K-01'],
        throughDate: '2026-07-10',
        lastObservationAt: '2026-07-10T22:00:00.000Z',
        chillingHoursAccumulated: 240,
        temperatureCoveragePercentage: 68,
        maximumGapHours: 96,
        continuitySufficient: false,
        interpretation: 'insufficient_data',
      }),
    );
    expect(response.dataSource.fieldTemperatureQuality).toBe('qualified');
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

  it('un biofix sin objetivo queda como anclaje visual pero no inicia GDD perenne', () => {
    const siembra = {
      fechaSiembra: '2020-08-15',
      semilla: { cultivo: 'Peral' },
      registrosFenologicos: [
        {
          id: 'biofix-1',
          tipoEvento: 'biofix',
          etapa: 'Brotacion',
          fechaInicioEtapa: '2026-07-02',
          campania: '2026-2027',
        },
        {
          id: 'observacion-1',
          tipoEvento: 'observacion',
          accion: 'observacion',
          etapa: 'Floracion',
          fechaObservacion: '2026-07-05',
          fecha: '2026-07-05',
          campania: '2026/2027',
        },
      ],
    } as any;
    const stages: Array<[string, number]> = [
      ['Brotacion', 0],
      ['Floracion', 10],
    ];

    expect(
      (engine as any).resolveObservedStage(siembra, '2026-07-05', stages),
    ).toBe('Floracion');
    expect(
      (engine as any).resolveObservedStage(siembra, '2026-07-06', stages),
    ).toBe('Brotacion');
    expect(
      (engine as any).resolveObservedStage(siembra, '2026-07-20', stages),
    ).toBe('Brotacion');
    expect(
      (engine as any).resolveThermalStart(siembra, '2026-07-06'),
    ).toBeUndefined();
    expect(
      (engine as any).hasCurrentCampaignBiofix(siembra, '2026-07-02'),
    ).toBe(false);
    siembra.registrosFenologicos[0].objetivosBiofix = ['inicio_forzado'];
    expect((engine as any).resolveThermalStart(siembra, '2026-07-06')).toBe(
      '2026-07-02',
    );
    expect(
      (engine as any).hasCurrentCampaignBiofix(siembra, '2026-07-02'),
    ).toBe(true);
  });

  it.each([
    {
      caso: 'confianza baja',
      confianza: 'baja',
      coberturaObservadaPct: 80,
    },
    {
      caso: 'cobertura nula',
      confianza: 'alta',
      coberturaObservadaPct: 0,
    },
  ])(
    'un biofix con $caso queda visible pero no gobierna frio, vernalizacion ni GDD',
    ({ confianza, coberturaObservadaPct }) => {
      const siembra = {
        fechaSiembra: '2020-08-15',
        semilla: { cultivo: 'Peral' },
        registrosFenologicos: [
          {
            id: 'biofix-referencia',
            tipoEvento: 'biofix',
            etapa: 'Emergencia',
            fechaInicioEtapa: '2026-07-02',
            campania: '2026/2027',
            confianza,
            coberturaObservadaPct,
            objetivosBiofix: [
              'inicio_acumulacion_frio',
              'inicio_forzado',
              'inicio_vernalizacion',
              'reinicio_gdd_etapa',
            ],
          },
        ],
      } as any;

      expect(
        (engine as any).resolveObservedStage(siembra, '2026-07-02', [
          ['Emergencia', 0],
        ]),
      ).toBe('Emergencia');
      expect(
        (engine as any).biofixDateForObjective(
          siembra,
          'inicio_acumulacion_frio',
          '2026-01-01',
          '2026-07-16',
        ),
      ).toBeUndefined();
      expect(
        (engine as any).resolveThermalStart(siembra, '2026-07-16'),
      ).toBeUndefined();
      expect(
        (engine as any).hasCurrentCampaignBiofix(siembra, '2026-07-02'),
      ).toBe(false);
      expect(
        (engine as any).hasBiofixObjectiveOnDate(
          siembra,
          '2026-07-02',
          'reinicio_gdd_etapa',
        ),
      ).toBe(false);
      expect(
        (engine as any).findEmergenceDate(siembra.registrosFenologicos),
      ).toBeUndefined();
      expect(
        (engine as any).resolveVernalizationWindow(
          {
            ...siembra,
            fechaSiembra: '2026-05-01',
            semilla: { cultivo: 'Trigo' },
          },
          {
            version: 'vernalizacion-test-v1',
            ventanaVernalizacion: {
              inicioEtapa: 'Emergencia',
              finEtapa: 'Espiguilla Terminal',
              unidad: 'dias_equivalentes',
            },
          },
          '2026-07-16',
        ),
      ).toEqual({});
    },
  );

  it('no inicia vernalizacion sin el biofix fenologico configurado', () => {
    const service = new AgrometeorologicalEngineService({} as any, {} as any);
    const series = (service as any).calculateVernalizationSeries(
      localHourlyTemperatureDay('2026-07-01', 5),
      {
        fechaSiembra: '2026-05-01',
        semilla: { cultivo: 'Trigo' },
      },
      {
        version: 'vernalizacion-test-v1',
        procesoTermico: 'vernalizacion_anual',
        rangoVernalizacionC: { min: 0, max: 10 },
        requerimientoVernalizacion: 45,
        modeloVernalizacion: 'ventana_calibrada',
        habitoVernalizacion: 'invernal',
        fuenteVernalizacion: 'Ensayo varietal trazable',
        estadoVernalizacion: 'validado',
        ventanaVernalizacion: {
          inicioEtapa: 'Emergencia',
          finEtapa: 'Espiguilla Terminal',
          unidad: 'dias_equivalentes',
        },
      },
      '2026-07-01',
    );

    expect(series.byDate.size).toBe(0);
    expect(series.start).toBeUndefined();
    expect(series.warnings.join(' ')).toContain(
      'falta registrar el inicio de la etapa Emergencia',
    );
  });

  it('solo acumula dias equivalentes completos dentro de la fase fenologica de vernalizacion', () => {
    const service = new AgrometeorologicalEngineService({} as any, {} as any);
    const parameters = {
      version: 'vernalizacion-test-v1',
      procesoTermico: 'vernalizacion_anual',
      rangoVernalizacionC: { min: 0, max: 10 },
      requerimientoVernalizacion: 45,
      modeloVernalizacion: 'ventana_calibrada',
      habitoVernalizacion: 'invernal',
      fuenteVernalizacion: 'Ensayo varietal trazable',
      estadoVernalizacion: 'validado',
      ventanaVernalizacion: {
        inicioEtapa: 'Emergencia',
        finEtapa: 'Espiguilla Terminal',
        unidad: 'dias_equivalentes',
      },
    };
    const siembra = {
      fechaSiembra: '2026-05-01',
      semilla: { cultivo: 'Trigo' },
      registrosFenologicos: [
        {
          id: 'inicio-vernalizacion',
          tipoEvento: 'biofix',
          etapa: 'Emergencia',
          fechaInicioEtapa: '2026-07-01',
          objetivosBiofix: ['inicio_vernalizacion'],
          campania: '2026/2027',
        },
        {
          id: 'fin-vernalizacion',
          tipoEvento: 'biofix',
          etapa: 'Espiguilla Terminal',
          fechaInicioEtapa: '2026-07-03',
          objetivosBiofix: ['fin_vernalizacion'],
          campania: '2026/2027',
        },
      ],
    };
    const observations = [
      ...localHourlyTemperatureDay('2026-07-01', 5),
      ...localHourlyTemperatureDay('2026-07-02', 5, 'open_meteo', [12]),
      ...localHourlyTemperatureDay('2026-07-03', 5),
      ...localHourlyTemperatureDay('2026-07-04', 5),
    ];

    const series = (service as any).calculateVernalizationSeries(
      observations,
      siembra,
      parameters,
      '2026-07-04',
    );

    expect(series).toMatchObject({
      start: '2026-07-01',
      end: '2026-07-03',
    });
    expect(series.byDate.get('2026-07-01')).toMatchObject({
      equivalentDays: 1,
      coveragePct: 100,
      windowActive: true,
    });
    expect(series.byDate.get('2026-07-02')).toMatchObject({
      equivalentDays: undefined,
      windowActive: true,
    });
    expect(series.byDate.get('2026-07-03')).toMatchObject({
      equivalentDays: 1,
      coveragePct: 100,
      windowActive: true,
    });
    expect(series.byDate.has('2026-07-04')).toBe(false);
    expect(
      [...series.byDate.values()].reduce(
        (sum: number, item: any) => sum + (item.equivalentDays || 0),
        0,
      ),
    ).toBe(2);
    expect(series.warnings.join(' ')).toContain(
      'La ventana de exposicion termica se cerro 2026-07-03',
    );
  });

  it('penaliza tambien la brecha final de vernalizacion', () => {
    const service = new AgrometeorologicalEngineService({} as any, {} as any);
    const series = (service as any).calculateVernalizationSeries(
      localHourlyTemperatureDay('2026-07-11', 5),
      {
        fechaSiembra: '2026-05-01',
        semilla: { cultivo: 'Trigo' },
        registrosFenologicos: [
          {
            id: 'inicio-vernalizacion',
            tipoEvento: 'biofix',
            etapa: 'Emergencia',
            fechaInicioEtapa: '2026-07-11',
            objetivosBiofix: ['inicio_vernalizacion'],
          },
        ],
      },
      {
        version: 'vernalizacion-test-v1',
        procesoTermico: 'vernalizacion_anual',
        rangoVernalizacionC: { min: 0, max: 10 },
        requerimientoVernalizacion: 45,
        modeloVernalizacion: 'ventana_calibrada',
        habitoVernalizacion: 'invernal',
        fuenteVernalizacion: 'Ensayo varietal trazable',
        estadoVernalizacion: 'validado',
        ventanaVernalizacion: {
          inicioEtapa: 'Emergencia',
          finEtapa: 'Espiguilla Terminal',
          unidad: 'dias_equivalentes',
        },
      },
      '2026-07-16',
      '2026-07-16T17:00:00.000Z',
    );

    expect(series.byDate.get('2026-07-16')).toMatchObject({
      equivalentDays: undefined,
      coveragePct: 0,
      windowActive: true,
    });
    expect(series.maximumGapHours).toBe(111);
    expect(series.continuitySufficient).toBe(false);
  });

  it('solo habilita la ventana de vernalizacion con estado especifico validado', () => {
    const service = new AgrometeorologicalEngineService({} as any, {} as any);
    const base = {
      version: 'vernalizacion-test-v1',
      procesoTermico: 'vernalizacion_anual',
      rangoVernalizacionC: { min: 0, max: 10 },
      requerimientoVernalizacion: 45,
      modeloVernalizacion: 'ventana_calibrada',
      habitoVernalizacion: 'invernal',
      fuenteVernalizacion: 'Ensayo varietal trazable',
      ventanaVernalizacion: {
        inicioEtapa: 'Emergencia',
        finEtapa: 'Espiguilla Terminal',
        unidad: 'dias_equivalentes',
      },
    };

    expect(
      (service as any).hasCalibratedVernalization({
        ...base,
        estado: 'referencia',
        estadoVernalizacion: 'requiere_calibracion',
      }),
    ).toBe(false);
    expect(
      (service as any).hasCalibratedVernalization({
        ...base,
        estado: 'referencia',
        estadoVernalizacion: 'validado',
      }),
    ).toBe(true);
    expect(
      (service as any).hasCalibratedVernalization({
        ...base,
        estado: 'validado',
      }),
    ).toBe(false);
    expect(
      (service as any).hasCalibratedVernalization({
        ...base,
        estadoVernalizacion: 'validado',
        modeloVernalizacion: 'apsim_trigo',
      }),
    ).toBe(false);
  });
});
