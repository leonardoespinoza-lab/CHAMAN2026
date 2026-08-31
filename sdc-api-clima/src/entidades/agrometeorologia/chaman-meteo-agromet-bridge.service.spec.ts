import {
  IChamanMeteoDaily,
  IObservacionMeteorologicaNormalizada,
} from 'modelos/src';
import {
  ChamanMeteoAgrometBridgeService,
  IChamanMeteoAgrometBridgeConfig,
  isChamanMeteoAgrometPilot,
  mergeDailyHistoricalGapFill,
  observationForChamanMeteoBridgeState,
  recordUsesChamanMeteo,
} from './chaman-meteo-agromet-bridge.service';

const LOT_ID = '64b000000000000000000010';
const SOWING_ID = '64b000000000000000000020';
const OTHER_SOWING_ID = '64b000000000000000000021';

const activeSowings = (ids: string[] = [SOWING_ID]) => ({
  datos: ids.map((_id) => ({ _id, idLote: LOT_ID, activa: true })),
  totalCount: ids.length,
});

const activeSowingsMock = () => jest.fn().mockResolvedValue(activeSowings());

const config = (
  data: Partial<IChamanMeteoAgrometBridgeConfig> = {},
): IChamanMeteoAgrometBridgeConfig => ({
  enabled: true,
  lotAllowlist: [LOT_ID],
  historicalStart: '2020-01-01',
  recentOpenMeteoDays: 5,
  calculationVersion: 'chaman-meteo-agro-v2',
  sourceVersion: 'era5-land-timeseries-19var-v2',
  ...data,
});

const resolvedBinding = (key = 'AR_-38.79_-68.10') => ({
  binding: {
    locationType: 'lote' as const,
    locationId: LOT_ID,
    gridPointKey: key,
    latitude: -38.7888,
    longitude: -68.10434,
    distanceKm: 0,
    active: true,
  },
  gridPoint: {
    key,
    latitude: -38.7888,
    longitude: -68.10434,
    countryCode: 'AR' as const,
    timezone: 'America/Argentina/Buenos_Aires',
    enabled: true,
    provider: 'copernicus-cds' as const,
    dataset: 'reanalysis-era5-land-timeseries' as const,
    historicalStart: '2020-01-01',
  },
});

const observation = (
  date: string,
  source: IObservacionMeteorologicaNormalizada['fuente'],
  values: IObservacionMeteorologicaNormalizada['valores'],
): IObservacionMeteorologicaNormalizada => ({
  idEstablecimiento: '64b000000000000000000001',
  idLote: LOT_ID,
  timestamp: `${date}T15:00:00.000Z`,
  fechaLocal: date,
  timezone: 'America/Argentina/Buenos_Aires',
  granularidad: 'daily',
  estado: 'estimated',
  esPronostico: false,
  valores: values,
  fuente: source,
  fuentePorVariable: Object.fromEntries(
    Object.keys(values).map((key) => [key, source]),
  ),
  estadoPorVariable: Object.fromEntries(
    Object.keys(values).map((key) => [key, 'estimated']),
  ),
  banderasCalidad: [],
  completitudPct: 100,
  obtenidoEn: '2026-08-28T12:00:00.000Z',
});

const daily = (date: string): IChamanMeteoDaily => ({
  gridPointKey: 'AR_-38.79_-68.10',
  date,
  timezone: 'America/Argentina/Buenos_Aires',
  calculationVersion: 'chaman-meteo-agro-v2',
  hoursAvailable: 24,
  hoursExpected: 24,
  availableHoursByMetric: {
    temperature: 24,
    relativeHumidity: 24,
    precipitation: 24,
    shortwaveRadiation: 24,
    et0: 24,
  },
  values: {
    temperatureMinC: 4,
    temperatureMeanC: 10,
    temperatureMaxC: 17,
    relativeHumidityMeanPct: 71,
    precipitationMm: 2,
    shortwaveRadiationMjM2: 11,
    et0Mm: 1.8,
  },
  qualityFlags: [],
  calculatedAt: '2026-08-28T10:00:00.000Z',
});

describe('ChamanMeteoAgrometBridgeService', () => {
  it('falla cerrado con flag apagado, lote no autorizado o contexto con mas de una siembra', () => {
    expect(
      isChamanMeteoAgrometPilot(config({ enabled: false }), LOT_ID, [
        SOWING_ID,
      ]),
    ).toBe(false);
    expect(
      isChamanMeteoAgrometPilot(config({ lotAllowlist: [] }), LOT_ID, [
        SOWING_ID,
      ]),
    ).toBe(false);
    expect(
      isChamanMeteoAgrometPilot(config(), LOT_ID, [
        SOWING_ID,
        '64b000000000000000000021',
      ]),
    ).toBe(false);
    expect(
      isChamanMeteoAgrometPilot(config(), LOT_ID, [SOWING_ID.toUpperCase()]),
    ).toBe(true);
  });

  it('consulta desde la siembra y reserva los ultimos cinco dias para Open-Meteo', async () => {
    const repository = {
      activeSowingsByLot: activeSowingsMock(),
      resolvedLocationBinding: jest.fn().mockResolvedValue(resolvedBinding()),
      daily: jest.fn().mockResolvedValue({
        datos: [daily('2026-05-01'), daily('2026-08-23')],
        total: 2,
      }),
    };
    const service = new ChamanMeteoAgrometBridgeService(repository as any);
    const recentOpenMeteo = observation('2026-08-25', 'open_meteo', {
      temperatureMinC: 7,
      temperatureMeanC: 13,
      temperatureMaxC: 20,
    });

    const result = await service.fillHistoricalDailyGaps(
      {
        observations: [recentOpenMeteo],
        idEstablecimiento: '64b000000000000000000001',
        idLote: LOT_ID,
        idSiembras: [SOWING_ID],
        coordenadas: { lat: -38.7888, lng: -68.10434 },
        desde: '2026-05-01',
        hasta: '2026-08-27',
        forecast: false,
        today: '2026-08-28',
      },
      config(),
    );

    expect(repository.daily).toHaveBeenCalledWith(
      'AR_-38.79_-68.10',
      500,
      0,
      'chaman-meteo-agro-v2',
      '2026-05-01',
      '2026-08-24',
    );
    expect(repository.activeSowingsByLot).toHaveBeenCalledTimes(2);
    expect(result.used).toBe(true);
    expect(result.observations.map((item) => item.fechaLocal)).toEqual([
      '2026-05-01',
      '2026-08-23',
      '2026-08-25',
    ]);
    expect(
      result.observations.find((item) => item.fechaLocal === '2026-08-25')
        ?.fuente,
    ).toBe('open_meteo');
  });

  it('calcula la ventana reciente con la fecha local de la grilla, no con UTC', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-28T01:00:00.000Z'));
    try {
      const repository = {
        activeSowingsByLot: activeSowingsMock(),
        resolvedLocationBinding: jest.fn().mockResolvedValue(resolvedBinding()),
        daily: jest.fn().mockResolvedValue({ datos: [], total: 0 }),
      };
      const service = new ChamanMeteoAgrometBridgeService(repository as any);

      await service.fillHistoricalDailyGaps(
        {
          observations: [],
          idEstablecimiento: '64b000000000000000000001',
          idLote: LOT_ID,
          idSiembras: [SOWING_ID],
          coordenadas: { lat: -38.7888, lng: -68.10434 },
          desde: '2026-05-01',
          hasta: '2026-08-27',
          forecast: false,
        },
        config(),
      );

      expect(repository.daily).toHaveBeenCalledWith(
        'AR_-38.79_-68.10',
        500,
        0,
        'chaman-meteo-agro-v2',
        '2026-05-01',
        '2026-08-23',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('rechaza dias ERA5 parciales para no fabricar cobertura termica', async () => {
    const partial = { ...daily('2026-05-01'), hoursAvailable: 23 };
    const repository = {
      activeSowingsByLot: activeSowingsMock(),
      resolvedLocationBinding: jest.fn().mockResolvedValue(resolvedBinding()),
      daily: jest.fn().mockResolvedValue({ datos: [partial], total: 1 }),
    };
    const service = new ChamanMeteoAgrometBridgeService(repository as any);
    const result = await service.fillHistoricalDailyGaps(
      {
        observations: [],
        idEstablecimiento: '64b000000000000000000001',
        idLote: LOT_ID,
        idSiembras: [SOWING_ID],
        coordenadas: { lat: -38.7888, lng: -68.10434 },
        desde: '2026-05-01',
        hasta: '2026-05-01',
        forecast: false,
        today: '2026-08-28',
      },
      config(),
    );

    expect(result.used).toBe(false);
    expect(result.observations).toEqual([]);
    expect(result.warnings.join(' ')).toContain('cobertura horaria completa');
  });

  it('rechaza una cobertura autoconsistente que no representa un dia civil', async () => {
    const invalidDay = {
      ...daily('2026-05-01'),
      hoursAvailable: 1,
      hoursExpected: 1,
      availableHoursByMetric: { temperature: 1 },
    };
    const repository = {
      activeSowingsByLot: activeSowingsMock(),
      resolvedLocationBinding: jest.fn().mockResolvedValue(resolvedBinding()),
      daily: jest.fn().mockResolvedValue({ datos: [invalidDay], total: 1 }),
    };
    const service = new ChamanMeteoAgrometBridgeService(repository as any);

    const result = await service.fillHistoricalDailyGaps(
      {
        observations: [],
        idEstablecimiento: '64b000000000000000000001',
        idLote: LOT_ID,
        idSiembras: [SOWING_ID],
        coordenadas: { lat: -38.7888, lng: -68.10434 },
        desde: '2026-05-01',
        hasta: '2026-05-01',
        forecast: false,
        today: '2026-08-28',
      },
      config(),
    );

    expect(result.used).toBe(false);
    expect(result.observations).toEqual([]);
  });

  it('omite una variable diaria si su propia cobertura horaria es parcial', async () => {
    const partialHumidity = {
      ...daily('2026-05-01'),
      availableHoursByMetric: {
        ...daily('2026-05-01').availableHoursByMetric,
        relativeHumidity: 23,
      },
    };
    const repository = {
      activeSowingsByLot: activeSowingsMock(),
      resolvedLocationBinding: jest.fn().mockResolvedValue(resolvedBinding()),
      daily: jest
        .fn()
        .mockResolvedValue({ datos: [partialHumidity], total: 1 }),
    };
    const service = new ChamanMeteoAgrometBridgeService(repository as any);

    const result = await service.fillHistoricalDailyGaps(
      {
        observations: [],
        idEstablecimiento: '64b000000000000000000001',
        idLote: LOT_ID,
        idSiembras: [SOWING_ID],
        coordenadas: { lat: -38.7888, lng: -68.10434 },
        desde: '2026-05-01',
        hasta: '2026-05-01',
        forecast: false,
        today: '2026-08-28',
      },
      config(),
    );

    expect(result.used).toBe(true);
    expect(result.observations[0].valores.temperatureMeanC).toBe(10);
    expect(
      result.observations[0].valores.relativeHumidityMeanPct,
    ).toBeUndefined();
    expect(
      result.observations[0].fuentePorVariable.relativeHumidityMeanPct,
    ).toBeUndefined();
  });

  it('bloquea el piloto si el batch agrupa mas de una siembra activa', async () => {
    const repository = {
      activeSowingsByLot: activeSowingsMock(),
      resolvedLocationBinding: jest.fn(),
      daily: jest.fn(),
    };
    const service = new ChamanMeteoAgrometBridgeService(repository as any);

    const result = await service.fillHistoricalDailyGaps(
      {
        observations: [],
        idEstablecimiento: '64b000000000000000000001',
        idLote: LOT_ID,
        idSiembras: [SOWING_ID, '64b000000000000000000021'],
        coordenadas: { lat: -38.7888, lng: -68.10434 },
        desde: '2026-05-01',
        hasta: '2026-05-01',
        forecast: false,
        today: '2026-08-28',
      },
      config(),
    );

    expect(result.used).toBe(false);
    expect(result.warnings.join(' ')).toContain('exactamente una siembra');
    expect(repository.resolvedLocationBinding).not.toHaveBeenCalled();
    expect(repository.daily).not.toHaveBeenCalled();
  });

  it('bloquea el bypass interactivo si el servidor encuentra otra siembra activa en el lote', async () => {
    const repository = {
      activeSowingsByLot: jest
        .fn()
        .mockResolvedValue(activeSowings([SOWING_ID, OTHER_SOWING_ID])),
      resolvedLocationBinding: jest.fn(),
      daily: jest.fn(),
    };
    const service = new ChamanMeteoAgrometBridgeService(repository as any);

    const result = await service.fillHistoricalDailyGaps(
      {
        observations: [],
        idEstablecimiento: '64b000000000000000000001',
        idLote: LOT_ID,
        // El camino interactivo solo conocia esta siembra y antes burlaba el gate.
        idSiembras: [SOWING_ID],
        coordenadas: { lat: -38.7888, lng: -68.10434 },
        desde: '2026-05-01',
        hasta: '2026-05-01',
        forecast: false,
        today: '2026-08-28',
      },
      config(),
    );

    expect(result.used).toBe(false);
    expect(result.warnings.join(' ')).toContain(
      'servidor de datos informo 2 siembras activas',
    );
    expect(repository.activeSowingsByLot).toHaveBeenCalledWith(LOT_ID);
    expect(repository.resolvedLocationBinding).not.toHaveBeenCalled();
    expect(repository.daily).not.toHaveBeenCalled();
  });

  it('bloquea si la siembra pedida no es la unica activa real del lote', async () => {
    const repository = {
      activeSowingsByLot: jest
        .fn()
        .mockResolvedValue(activeSowings([OTHER_SOWING_ID])),
      resolvedLocationBinding: jest.fn(),
      daily: jest.fn(),
    };
    const service = new ChamanMeteoAgrometBridgeService(repository as any);

    const result = await service.fillHistoricalDailyGaps(
      {
        observations: [],
        idEstablecimiento: '64b000000000000000000001',
        idLote: LOT_ID,
        idSiembras: [SOWING_ID],
        coordenadas: { lat: -38.7888, lng: -68.10434 },
        desde: '2026-05-01',
        hasta: '2026-05-01',
        forecast: false,
        today: '2026-08-28',
      },
      config(),
    );

    expect(result.used).toBe(false);
    expect(result.warnings.join(' ')).toContain(
      'no coincide con la unica siembra activa real',
    );
    expect(repository.resolvedLocationBinding).not.toHaveBeenCalled();
  });

  it('revalida el conjunto activo antes de aplicar ERA5 y aborta ante un cambio concurrente', async () => {
    const base = observation('2026-05-01', 'open_meteo', {
      precipitationMm: 3,
    });
    const repository = {
      activeSowingsByLot: jest
        .fn()
        .mockResolvedValueOnce(activeSowings())
        .mockResolvedValueOnce(activeSowings([SOWING_ID, OTHER_SOWING_ID])),
      resolvedLocationBinding: jest.fn().mockResolvedValue(resolvedBinding()),
      daily: jest.fn().mockResolvedValue({
        datos: [daily('2026-05-01')],
        total: 1,
      }),
    };
    const service = new ChamanMeteoAgrometBridgeService(repository as any);

    const result = await service.fillHistoricalDailyGaps(
      {
        observations: [base],
        idEstablecimiento: '64b000000000000000000001',
        idLote: LOT_ID,
        idSiembras: [SOWING_ID],
        coordenadas: { lat: -38.7888, lng: -68.10434 },
        desde: '2026-05-01',
        hasta: '2026-05-01',
        forecast: false,
        today: '2026-08-28',
      },
      config(),
    );

    expect(repository.daily).toHaveBeenCalled();
    expect(repository.activeSowingsByLot).toHaveBeenCalledTimes(2);
    expect(result.used).toBe(false);
    expect(result.observations).toEqual([base]);
    expect(result.warnings.join(' ')).toContain(
      'servidor de datos informo 2 siembras activas',
    );
  });

  it('bloquea fechas daily duplicadas antes de mezclarlas o persistirlas', async () => {
    const repository = {
      activeSowingsByLot: activeSowingsMock(),
      resolvedLocationBinding: jest.fn().mockResolvedValue(resolvedBinding()),
      daily: jest.fn().mockResolvedValue({
        datos: [daily('2026-05-01'), daily('2026-05-01')],
        total: 2,
      }),
    };
    const service = new ChamanMeteoAgrometBridgeService(repository as any);

    const result = await service.fillHistoricalDailyGaps(
      {
        observations: [],
        idEstablecimiento: '64b000000000000000000001',
        idLote: LOT_ID,
        idSiembras: [SOWING_ID],
        coordenadas: { lat: -38.7888, lng: -68.10434 },
        desde: '2026-05-01',
        hasta: '2026-05-01',
        forecast: false,
        today: '2026-08-28',
      },
      config(),
    );

    expect(result.used).toBe(false);
    expect(result.observations).toEqual([]);
    expect(result.warnings.join(' ')).toContain('fechas duplicadas');
  });

  it.each([
    [
      'distancia inconsistente',
      {
        ...resolvedBinding(),
        binding: { ...resolvedBinding().binding, distanceKm: 8 },
      },
      'distancia declarada',
    ],
    [
      'timezone invalido',
      {
        ...resolvedBinding(),
        gridPoint: { ...resolvedBinding().gridPoint, timezone: 'UTC+3' },
      },
      'timezone operativo',
    ],
    [
      'grilla desplazada',
      {
        ...resolvedBinding(),
        gridPoint: {
          ...resolvedBinding().gridPoint,
          latitude: -20,
          longitude: -50,
        },
      },
      'distancia declarada',
    ],
  ])('rechaza binding con %s', async (_label, resolved, expectedWarning) => {
    const repository = {
      activeSowingsByLot: activeSowingsMock(),
      resolvedLocationBinding: jest.fn().mockResolvedValue(resolved),
      daily: jest.fn(),
    };
    const service = new ChamanMeteoAgrometBridgeService(repository as any);

    const result = await service.fillHistoricalDailyGaps(
      {
        observations: [],
        idEstablecimiento: '64b000000000000000000001',
        idLote: LOT_ID,
        idSiembras: [SOWING_ID],
        coordenadas: { lat: -38.7888, lng: -68.10434 },
        desde: '2026-05-01',
        hasta: '2026-05-01',
        forecast: false,
        today: '2026-08-28',
      },
      config(),
    );

    expect(result.used).toBe(false);
    expect(result.warnings.join(' ')).toContain(expectedWarning);
    expect(repository.daily).not.toHaveBeenCalled();
  });

  it('rechaza un daily cuya timezone no coincide con la grilla', async () => {
    const invalidTimezone = { ...daily('2026-05-01'), timezone: 'UTC' };
    const repository = {
      activeSowingsByLot: activeSowingsMock(),
      resolvedLocationBinding: jest.fn().mockResolvedValue(resolvedBinding()),
      daily: jest.fn().mockResolvedValue({
        datos: [invalidTimezone],
        total: 1,
      }),
    };
    const service = new ChamanMeteoAgrometBridgeService(repository as any);

    const result = await service.fillHistoricalDailyGaps(
      {
        observations: [],
        idEstablecimiento: '64b000000000000000000001',
        idLote: LOT_ID,
        idSiembras: [SOWING_ID],
        coordenadas: { lat: -38.7888, lng: -68.10434 },
        desde: '2026-05-01',
        hasta: '2026-05-01',
        forecast: false,
        today: '2026-08-28',
      },
      config(),
    );

    expect(result.used).toBe(false);
    expect(result.observations).toEqual([]);
    expect(result.warnings.join(' ')).toContain('zona horaria');
  });

  it('no incorpora temperatura ni humedad de suelo en el puente v1', async () => {
    const withSoil: IChamanMeteoDaily = {
      ...daily('2026-05-01'),
      availableHoursByMetric: {
        ...daily('2026-05-01').availableHoursByMetric,
        soilTemperature: [24, 24, 24, 24],
        soilWater: [24, 24, 24, 24],
      },
      values: {
        ...daily('2026-05-01').values,
        soilTemperatureMeanC: [9, 10, 11, 12],
        soilWaterMeanM3M3: [0.2, 0.21, 0.22, 0.23],
      },
    };
    const repository = {
      activeSowingsByLot: activeSowingsMock(),
      resolvedLocationBinding: jest.fn().mockResolvedValue(resolvedBinding()),
      daily: jest.fn().mockResolvedValue({ datos: [withSoil], total: 1 }),
    };
    const service = new ChamanMeteoAgrometBridgeService(repository as any);

    const result = await service.fillHistoricalDailyGaps(
      {
        observations: [],
        idEstablecimiento: '64b000000000000000000001',
        idLote: LOT_ID,
        idSiembras: [SOWING_ID],
        coordenadas: { lat: -38.7888, lng: -68.10434 },
        desde: '2026-05-01',
        hasta: '2026-05-01',
        forecast: false,
        today: '2026-08-28',
      },
      config(),
    );

    expect(result.used).toBe(true);
    expect(result.observations[0].valores.soilTemperatureC).toBeUndefined();
    expect(result.observations[0].valores.soilMoistureM3M3).toBeUndefined();
    expect(result.observations[0].banderasCalidad).toContain(
      'chaman_meteo_atmospheric_only_v1',
    );
  });
});

describe('kill switch Chaman-Meteo', () => {
  it('retira variables ERA5 de una fila mixta y conserva Open-Meteo', () => {
    const mixed = observation('2026-05-01', 'mixed', {
      temperatureMinC: 4,
      temperatureMeanC: 10,
      temperatureMaxC: 17,
      precipitationMm: 3,
    });
    mixed.fuentePorVariable = {
      temperatureMinC: 'chaman_meteo',
      temperatureMeanC: 'chaman_meteo',
      temperatureMaxC: 'chaman_meteo',
      precipitationMm: 'open_meteo',
    };
    mixed.banderasCalidad = ['chaman_meteo_historical_gap_fill'];

    const disabled = observationForChamanMeteoBridgeState(mixed, false);

    expect(disabled?.valores).toEqual({ precipitationMm: 3 });
    expect(disabled?.fuente).toBe('open_meteo');
    expect(disabled?.fuentePorVariable).toEqual({
      precipitationMm: 'open_meteo',
    });
    expect(recordUsesChamanMeteo(disabled as any)).toBe(false);
    expect(disabled?.banderasCalidad).toContain(
      'chaman_meteo_disabled_source_removed',
    );
    expect(observationForChamanMeteoBridgeState(disabled as any, false)).toBe(
      disabled,
    );
  });

  it('descarta una fila enteramente ERA5 al apagar y la conserva al reactivar', () => {
    const era5 = observation('2026-05-01', 'chaman_meteo', {
      temperatureMinC: 4,
      temperatureMeanC: 10,
      temperatureMaxC: 17,
    });
    era5.banderasCalidad = ['chaman_meteo_historical_gap_fill'];

    expect(observationForChamanMeteoBridgeState(era5, false)).toBeUndefined();
    expect(observationForChamanMeteoBridgeState(era5, true)).toBe(era5);
  });

  it('falla cerrado si una fila ERA5 antigua no permite separar la procedencia', () => {
    const opaque = observation('2026-05-01', 'mixed', {
      temperatureMeanC: 10,
      precipitationMm: 3,
    });
    opaque.fuentePorVariable = {};
    opaque.banderasCalidad = ['chaman_meteo_historical_gap_fill'];

    expect(observationForChamanMeteoBridgeState(opaque, false)).toBeUndefined();
  });
});

describe('mergeDailyHistoricalGapFill', () => {
  it('mantiene sensor > FieldClimate > Open-Meteo > ERA5 y elimina duplicados diarios', () => {
    const open = observation('2026-05-01', 'open_meteo', {
      temperatureMeanC: 11,
      precipitationMm: 3,
    });
    const station = observation('2026-05-01', 'station', {
      temperatureMeanC: 12,
    });
    const sensor = observation('2026-05-01', 'sensor', {
      temperatureMeanC: 13,
    });
    const era5 = observation('2026-05-01', 'chaman_meteo', {
      temperatureMeanC: 99,
      relativeHumidityMeanPct: 70,
    });

    const merged = mergeDailyHistoricalGapFill([open, station, sensor], [era5]);

    expect(merged).toHaveLength(1);
    expect(merged[0].valores.temperatureMeanC).toBe(13);
    expect(merged[0].fuentePorVariable.temperatureMeanC).toBe('sensor');
    expect(merged[0].valores.precipitationMm).toBe(3);
    expect(merged[0].fuentePorVariable.precipitationMm).toBe('open_meteo');
    expect(merged[0].valores.relativeHumidityMeanPct).toBe(70);
    expect(merged[0].fuentePorVariable.relativeHumidityMeanPct).toBe(
      'chaman_meteo',
    );
    expect(merged[0].fuente).toBe('mixed');
  });

  it('no agrega flags ERA5 cuando Open-Meteo ya cubre todas las variables', () => {
    const open = observation('2026-05-01', 'open_meteo', {
      temperatureMinC: 4,
      temperatureMeanC: 10,
      temperatureMaxC: 17,
      relativeHumidityMeanPct: 71,
      precipitationMm: 2,
      shortwaveRadiationMjM2: 11,
      et0Mm: 1.8,
    });
    const era5 = {
      ...observation('2026-05-01', 'chaman_meteo', open.valores),
      banderasCalidad: ['chaman_meteo_historical_gap_fill'],
    };

    const [merged] = mergeDailyHistoricalGapFill([open], [era5]);

    expect(merged).toBe(open);
    expect(merged.banderasCalidad).not.toContain(
      'chaman_meteo_historical_gap_fill',
    );
  });

  it('deriva la media desde minima y maxima Open-Meteo antes de usar ERA5', () => {
    const partialOpen = observation('2026-07-08', 'open_meteo', {
      temperatureMinC: 13.5,
      temperatureMaxC: 14.7,
      precipitationMm: 1.2,
    });
    const era5 = observation('2026-07-08', 'chaman_meteo', {
      temperatureMinC: 8,
      temperatureMeanC: 12.7371,
      temperatureMaxC: 18,
      relativeHumidityMeanPct: 76,
    });

    const [merged] = mergeDailyHistoricalGapFill([partialOpen], [era5]);

    expect(merged.valores.temperatureMinC).toBe(13.5);
    expect(merged.valores.temperatureMeanC).toBeCloseTo(14.1, 6);
    expect(merged.valores.temperatureMaxC).toBe(14.7);
    expect(merged.fuentePorVariable.temperatureMeanC).toBe(
      'derived_open_meteo',
    );
    expect(merged.valores.precipitationMm).toBe(1.2);
    expect(merged.fuentePorVariable.precipitationMm).toBe('open_meteo');
    expect(merged.banderasCalidad).toContain(
      'temperature_mean_derived_from_daily_min_max',
    );
  });

  it('no incorpora variables termicas de fallback si formarian un triplete incoherente', () => {
    const primary = observation('2026-07-08', 'open_meteo', {
      temperatureMinC: 13.5,
      temperatureMeanC: 13.8,
      precipitationMm: 1.2,
    });
    const fallback = observation('2026-07-08', 'chaman_meteo', {
      temperatureMaxC: 12,
      relativeHumidityMeanPct: 76,
    });

    const [merged] = mergeDailyHistoricalGapFill([primary], [fallback]);

    expect(merged.valores.temperatureMinC).toBe(13.5);
    expect(merged.valores.temperatureMeanC).toBe(13.8);
    expect(merged.valores.temperatureMaxC).toBeUndefined();
    expect(merged.valores.relativeHumidityMeanPct).toBe(76);
    expect(merged.banderasCalidad).toContain(
      'historical_fallback_temperature_triplet_incoherent',
    );
  });
});
