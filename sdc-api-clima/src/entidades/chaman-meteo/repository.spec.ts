import { API_DATOS } from '../../env';
import { ChamanMeteoRepository } from './repository';

describe('ChamanMeteoRepository', () => {
  const axios = { GET: jest.fn() };
  const repository = new ChamanMeteoRepository(axios as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filters storage status by the active calculation version', () => {
    repository.status(
      'chaman-meteo-agro-v2',
      'era5-land-timeseries-19var-v2',
    );

    expect(axios.GET).toHaveBeenCalledWith(
      `${API_DATOS}/chaman-meteo-internal/status`,
      expect.objectContaining({
        params: {
          calculationVersion: 'chaman-meteo-agro-v2',
          sourceVersion: 'era5-land-timeseries-19var-v2',
        },
      }),
    );
  });

  it('filters the job page by the active calculation version', () => {
    repository.jobs(
      25,
      5,
      'chaman-meteo-agro-v2',
      'era5-land-timeseries-19var-v2',
    );

    expect(axios.GET).toHaveBeenCalledWith(
      `${API_DATOS}/chaman-meteo-internal/jobs`,
      expect.objectContaining({
        params: {
          limit: 25,
          offset: 5,
          calculationVersion: 'chaman-meteo-agro-v2',
          sourceVersion: 'era5-land-timeseries-19var-v2',
        },
      }),
    );
  });

  it.each([
    ['hourly', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', 48],
    ['daily', '2026-08-01', '2026-09-01', 30],
  ] as const)(
    'forwards %s range and calculation version to storage',
    (grain, from, toExclusive, limit) => {
      repository[grain](
        'pilot-grid',
        limit,
        7,
        'chaman-meteo-agro-v2',
        from,
        toExclusive,
      );

      expect(axios.GET).toHaveBeenCalledWith(
        `${API_DATOS}/chaman-meteo-internal/${grain}`,
        expect.objectContaining({
          params: {
            gridPointKey: 'pilot-grid',
            from,
            toExclusive,
            limit,
            offset: 7,
            calculationVersion: 'chaman-meteo-agro-v2',
          },
        }),
      );
    },
  );

  it('resuelve el binding exacto del lote mediante el contrato interno', () => {
    repository.resolvedLocationBinding('lote', '64b000000000000000000010');

    expect(axios.GET).toHaveBeenCalledWith(
      `${API_DATOS}/chaman-meteo-internal/bindings/lote/64b000000000000000000010`,
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });
});
