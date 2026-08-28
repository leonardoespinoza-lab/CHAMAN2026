import {
  IChamanMeteoDaily,
  IObservacionMeteorologicaNormalizada,
} from 'modelos/src';
import {
  ChamanMeteoAgrometBridgeService,
  IChamanMeteoAgrometBridgeConfig,
  isChamanMeteoAgrometPilot,
  mergeDailyHistoricalGapFill,
} from './chaman-meteo-agromet-bridge.service';

const LOT_ID = '64b000000000000000000010';
const SOWING_ID = '64b000000000000000000020';

const config = (
  data: Partial<IChamanMeteoAgrometBridgeConfig> = {},
): IChamanMeteoAgrometBridgeConfig => ({
  enabled: true,
  lotAllowlist: [LOT_ID],
  sowingAllowlist: [],
  historicalStart: '2020-01-01',
  recentOpenMeteoDays: 5,
  calculationVersion: 'chaman-meteo-agro-v2',
  sourceVersion: 'era5-land-timeseries-19var-v2',
  ...data,
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
  it('falla cerrado con flag apagado o sin allowlist explicita', () => {
    expect(isChamanMeteoAgrometPilot(config({ enabled: false }), LOT_ID)).toBe(
      false,
    );
    expect(
      isChamanMeteoAgrometPilot(
        config({ lotAllowlist: [], sowingAllowlist: [] }),
        LOT_ID,
      ),
    ).toBe(false);
    expect(
      isChamanMeteoAgrometPilot(
        config({ lotAllowlist: [], sowingAllowlist: [SOWING_ID] }),
        LOT_ID,
        [SOWING_ID.toUpperCase()],
      ),
    ).toBe(true);
  });

  it('consulta desde la siembra y reserva los ultimos cinco dias para Open-Meteo', async () => {
    const repository = {
      resolvedLocationBinding: jest.fn().mockResolvedValue({
        binding: {
          locationType: 'lote',
          locationId: LOT_ID,
          gridPointKey: 'AR_-38.79_-68.10',
          latitude: -38.7888,
          longitude: -68.10434,
          distanceKm: 0,
          active: true,
        },
        gridPoint: {
          key: 'AR_-38.79_-68.10',
          latitude: -38.7888,
          longitude: -68.10434,
          enabled: true,
        },
      }),
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

  it('rechaza dias ERA5 parciales para no fabricar cobertura termica', async () => {
    const partial = { ...daily('2026-05-01'), hoursAvailable: 23 };
    const repository = {
      resolvedLocationBinding: jest.fn().mockResolvedValue({
        binding: {
          locationType: 'lote',
          locationId: LOT_ID,
          gridPointKey: 'grid',
          latitude: -38.7888,
          longitude: -68.10434,
          distanceKm: 0,
          active: true,
        },
        gridPoint: {
          key: 'grid',
          latitude: -38.7888,
          longitude: -68.10434,
          enabled: true,
        },
      }),
      daily: jest.fn().mockResolvedValue({ datos: [partial], total: 1 }),
    };
    const service = new ChamanMeteoAgrometBridgeService(repository as any);
    const result = await service.fillHistoricalDailyGaps(
      {
        observations: [],
        idEstablecimiento: '64b000000000000000000001',
        idLote: LOT_ID,
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
      resolvedLocationBinding: jest.fn().mockResolvedValue({
        binding: {
          locationType: 'lote',
          locationId: LOT_ID,
          gridPointKey: 'grid',
          latitude: -38.7888,
          longitude: -68.10434,
          distanceKm: 0,
          active: true,
        },
        gridPoint: {
          key: 'grid',
          latitude: -38.7888,
          longitude: -68.10434,
          enabled: true,
        },
      }),
      daily: jest.fn().mockResolvedValue({ datos: [invalidDay], total: 1 }),
    };
    const service = new ChamanMeteoAgrometBridgeService(repository as any);

    const result = await service.fillHistoricalDailyGaps(
      {
        observations: [],
        idEstablecimiento: '64b000000000000000000001',
        idLote: LOT_ID,
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
      resolvedLocationBinding: jest.fn().mockResolvedValue({
        binding: {
          locationType: 'lote',
          locationId: LOT_ID,
          gridPointKey: 'grid',
          latitude: -38.7888,
          longitude: -68.10434,
          distanceKm: 0,
          active: true,
        },
        gridPoint: {
          key: 'grid',
          latitude: -38.7888,
          longitude: -68.10434,
          enabled: true,
        },
      }),
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
});
