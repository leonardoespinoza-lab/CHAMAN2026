import { WeatherIngestionService } from './weather-ingestion.service';
import { WeatherSourceResolverService } from './weather-source-resolver.service';

describe('WeatherIngestionService', () => {
  const service = new WeatherIngestionService({} as any, {} as any, {} as any);

  afterEach(() => jest.useRealTimers());

  it('detecta una central desactualizada y explicita el fallback automatico', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T18:00:00.000Z'));
    const warning = (service as any).stationFreshnessWarning(
      'station-1',
      [{ timestamp: '2026-07-13T08:00:00.000Z' }],
      true,
    );
    expect(warning).toContain('Open-Meteo automaticamente');
    expect(warning).toContain('ultimas 6 h');
  });

  it('no marca como atrasada una lectura reciente ni un establecimiento sin central', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T18:00:00.000Z'));
    expect(
      (service as any).stationFreshnessWarning(
        'station-1',
        [{ timestamp: '2026-07-13T16:00:00.000Z' }],
        true,
      ),
    ).toBeUndefined();
    expect(
      (service as any).stationFreshnessWarning(undefined, [], true),
    ).toBeUndefined();
  });

  it('usa la fecha local argentina al separar historico y pronostico', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T01:30:00.000Z'));

    expect((service as any).dateOnly(new Date())).toBe('2026-04-30');
    expect((service as any).dateOnly('2026-05-01')).toBe('2026-05-01');
  });

  it('continua desde dos dias antes del ultimo consolidado', async () => {
    const repository = {
      getObservaciones: jest
        .fn()
        .mockResolvedValueOnce({
          datos: [{ fechaLocal: '2020-01-01' }],
        })
        .mockResolvedValueOnce({
          datos: [{ fechaLocal: '2026-07-13' }],
        }),
    };
    const incremental = new WeatherIngestionService(
      {} as any,
      repository as any,
      {} as any,
    );

    await expect(
      (incremental as any).resolverDesdeIncremental('est-1', '2020-01-01'),
    ).resolves.toBe('2026-07-11');
    expect(repository.getObservaciones.mock.calls[0][0].sort).toBe('timestamp');
    expect(repository.getObservaciones.mock.calls[1][0].sort).toBe(
      '-timestamp',
    );
  });

  it('calcula el incremental con la serie exacta del lote y no con otro lote del establecimiento', async () => {
    const lotId = '64b000000000000000000010';
    const repository = {
      getObservaciones: jest
        .fn()
        .mockResolvedValueOnce({
          datos: [
            {
              fechaLocal: '2025-01-01',
              contextosLote: {
                [lotId]: {
                  idLote: lotId,
                  fechaLocal: '2026-05-01',
                },
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          datos: [
            {
              fechaLocal: '2026-07-01',
              contextosLote: {
                [lotId]: {
                  idLote: lotId,
                  fechaLocal: '2026-07-13',
                },
              },
            },
          ],
        }),
    };
    const incremental = new WeatherIngestionService(
      {} as any,
      repository as any,
      {} as any,
    );

    await expect(
      (incremental as any).resolverDesdeIncremental(
        'est-1',
        '2026-05-01',
        lotId,
      ),
    ).resolves.toBe('2026-07-11');

    const parsedFilter = JSON.parse(
      repository.getObservaciones.mock.calls[0][0].filter,
    );
    expect(parsedFilter.$or).toContainEqual({ idLote: lotId });
    expect(parsedFilter.$or).toContainEqual({
      [`contextosLote.${lotId}.idLote`]: lotId,
    });
  });

  it('usa las horas de la central como evidencia antes de aceptar su agregado diario', async () => {
    const hourlyRows = Array.from({ length: 24 }, (_, hour) => ({
      fecha: new Date(Date.UTC(2026, 6, 13, hour + 3)).toISOString(),
      temperatura: { last: 12 + hour / 3 },
      humedad: { last: 78 },
      lluvia: { sum: 0 },
      velocidadViento: { avg: 10 },
      radiacionSolar: { avg: 120 },
      et0: { result: 0.1 },
    }));
    const clima = {
      getOpenMeteoAgrometeorologia: jest.fn().mockResolvedValue({
        timezone: 'America/Argentina/Cordoba',
        utc_offset_seconds: -10800,
        hourly: { time: [] },
        daily: {
          time: ['2026-07-13'],
          temperature_2m_min: [8],
          temperature_2m_mean: [14],
          temperature_2m_max: [20],
          relative_humidity_2m_mean: [70],
          precipitation_sum: [2],
          shortwave_radiation_sum: [11],
          et0_fao_evapotranspiration: [2],
        },
      }),
      getDatosEstacionAsociada: jest.fn(
        async (
          _stationId: string,
          _from: string,
          _to: string,
          granularidad: 'hourly' | 'daily',
        ) => ({
          estacion: { name: { custom: 'Central verificada' } },
          datos:
            granularidad === 'hourly'
              ? hourlyRows
              : [
                  {
                    fecha: '2026-07-13T00:00:00.000Z',
                    temperatura: { min: 7, avg: 16, max: 22 },
                    humedad: { avg: 78 },
                    lluvia: { sum: 0 },
                    velocidadViento: { avg: 10 },
                    radiacionSolar: { avg: 120 },
                    et0: { result: 2.4 },
                  },
                ],
          advertencias: [],
        }),
      ),
    };
    const repository = {
      upsertObservaciones: jest.fn().mockResolvedValue(undefined),
    };
    const ingestion = new WeatherIngestionService(
      clima as any,
      repository as any,
      new WeatherSourceResolverService(),
    );

    await (ingestion as any).ingestarPeriodo(
      {
        _id: 'est-1',
        idEstacionMeteorologica: 'station-1',
      },
      { lat: -32.7, lng: -61.9 },
      '2026-07-13',
      '2026-07-13',
      false,
    );

    expect(clima.getDatosEstacionAsociada).toHaveBeenCalledWith(
      'station-1',
      '2026-07-13T03:00:00.000Z',
      '2026-07-14T02:59:59.999Z',
      'hourly',
    );
    const persisted = repository.upsertObservaciones.mock.calls
      .flatMap((call) => call[0])
      .find((item) => item.granularidad === 'daily');
    expect(persisted.valores.temperatureMeanC).toBe(16);
    expect(persisted.fuentePorVariable.temperatureMeanC).toBe('station');
    expect(persisted.banderasCalidad).toContain(
      'station_daily_coverage_verified_from_hourly',
    );
  });
});
