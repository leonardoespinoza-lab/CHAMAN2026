import { WeatherIngestionService } from './weather-ingestion.service';

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
      (incremental as any).resolverDesdeIncremental(
        'est-1',
        '2020-01-01',
      ),
    ).resolves.toBe('2026-07-11');
    expect(repository.getObservaciones.mock.calls[0][0].sort).toBe(
      'timestamp',
    );
    expect(repository.getObservaciones.mock.calls[1][0].sort).toBe(
      '-timestamp',
    );
  });
});
