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
});
