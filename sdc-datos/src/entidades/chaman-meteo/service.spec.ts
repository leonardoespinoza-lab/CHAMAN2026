import { BadRequestException } from '@nestjs/common';
import { ChamanMeteoService } from './service';

describe('ChamanMeteoService', () => {
  const repository = {
    hourlyPage: jest.fn(),
    dailyPage: jest.fn(),
    status: jest.fn(),
    jobByKey: jest.fn(),
    jobPage: jest.fn(),
    recalculateCoverage: jest.fn(),
    coverageByGridPoint: jest.fn(),
    upsertVersionedHourlyRaw: jest.fn(),
    resolvedLocationBinding: jest.fn(),
  };
  const service = new ChamanMeteoService(repository as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards the persisted-hourly window and calculation version', () => {
    service.hourly(
      'pilot-grid',
      '2026-08-31T03:00:00Z',
      '2026-09-02T03:00:00Z',
      'chaman-meteo-agro-v1',
      '500',
      '0',
    );

    expect(repository.hourlyPage).toHaveBeenCalledWith(
      'pilot-grid',
      new Date('2026-08-31T03:00:00Z'),
      new Date('2026-09-02T03:00:00Z'),
      'chaman-meteo-agro-v1',
      500,
      0,
    );
  });

  it('rejects an inverted hourly window', () => {
    expect(() =>
      service.hourly(
        'pilot-grid',
        '2026-09-02T03:00:00Z',
        '2026-08-31T03:00:00Z',
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects an hourly range before 2020 with the stable business error', () => {
    try {
      service.hourly(
        'pilot-grid',
        '2019-12-31T23:00:00Z',
        '2020-01-02T00:00:00Z',
      );
      throw new Error('La consulta debio ser rechazada');
    } catch (caught) {
      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toEqual({
        error: 'historical_data_before_limit',
        historical_available_from: '2020-01-01',
      });
    }
  });

  it('filters daily data by calendar window and calculation version', () => {
    service.daily(
      'pilot-grid',
      'chaman-meteo-agro-v1',
      '30',
      '0',
      '2026-08-01',
      '2026-09-01',
    );

    expect(repository.dailyPage).toHaveBeenCalledWith(
      'pilot-grid',
      'chaman-meteo-agro-v1',
      30,
      0,
      '2026-08-01',
      '2026-09-01',
    );
  });

  it.each(['2026-02-30', '2026-08-01T00:00:00Z', '01-08-2026'])(
    'rejects invalid daily calendar date %s',
    (from) => {
      expect(() =>
        service.daily(
          'pilot-grid',
          'chaman-meteo-agro-v1',
          '30',
          '0',
          from,
          '2026-09-01',
        ),
      ).toThrow(BadRequestException);
    },
  );

  it('rejects a daily range before 2020 with the stable business error', () => {
    try {
      service.daily(
        'pilot-grid',
        'chaman-meteo-agro-v2',
        '30',
        '0',
        '2019-12-31',
        '2020-01-02',
      );
      throw new Error('La consulta debio ser rechazada');
    } catch (caught) {
      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toEqual({
        error: 'historical_data_before_limit',
        historical_available_from: '2020-01-01',
      });
    }
  });

  it.each([
    ['2026-09-01', '2026-09-01'],
    ['2026-09-02', '2026-09-01'],
  ])('rejects invalid daily window %s..%s', (from, toExclusive) => {
    expect(() =>
      service.daily(
        'pilot-grid',
        'chaman-meteo-agro-v1',
        '30',
        '0',
        from,
        toExclusive,
      ),
    ).toThrow(BadRequestException);
  });

  it('keeps the legacy unbounded daily call backward compatible', () => {
    service.daily('pilot-grid', 'chaman-meteo-agro-v1', '30', '0');

    expect(repository.dailyPage).toHaveBeenCalledWith(
      'pilot-grid',
      'chaman-meteo-agro-v1',
      30,
      0,
      undefined,
      undefined,
    );
  });

  it('rejects an invalid grid-point historical start', () => {
    expect(() =>
      service.upsertGridPoint({
        key: 'pilot-grid',
        latitude: -38.7888,
        longitude: -68.10434,
        countryCode: 'AR',
        timezone: 'America/Argentina/Buenos_Aires',
        enabled: true,
        historicalStart: '2026-02-30',
        provider: 'copernicus-cds',
        dataset: 'reanalysis-era5-land-timeseries',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects a grid-point historical start before the fixed 2020 boundary', () => {
    expect(() =>
      service.upsertGridPoint({
        key: 'pilot-grid',
        latitude: -38.7888,
        longitude: -68.10434,
        countryCode: 'AR',
        timezone: 'America/Argentina/Buenos_Aires',
        enabled: true,
        historicalStart: '2019-12-31',
        provider: 'copernicus-cds',
        dataset: 'reanalysis-era5-land-timeseries',
      }),
    ).toThrow(BadRequestException);
  });

  it('forwards the exact calculation/source pair to status and coverage', () => {
    service.status(
      ' chaman-meteo-agro-v2 ',
      ' era5-land-timeseries-19var-v2 ',
    );
    service.coverage(
      'pilot-grid',
      ' chaman-meteo-agro-v2 ',
      ' era5-land-timeseries-19var-v2 ',
    );
    service.recalculateCoverage(
      'pilot-grid',
      ' chaman-meteo-agro-v2 ',
      ' era5-land-timeseries-19var-v2 ',
    );

    expect(repository.status).toHaveBeenCalledWith(
      'chaman-meteo-agro-v2',
      'era5-land-timeseries-19var-v2',
    );
    expect(repository.coverageByGridPoint).toHaveBeenCalledWith(
      'pilot-grid',
      'chaman-meteo-agro-v2',
      'era5-land-timeseries-19var-v2',
    );
    expect(repository.recalculateCoverage).toHaveBeenCalledWith(
      'pilot-grid',
      'chaman-meteo-agro-v2',
      'era5-land-timeseries-19var-v2',
    );
  });

  it.each([
    ['chaman-meteo-agro-v2', undefined],
    [undefined, 'era5-land-timeseries-19var-v2'],
  ])(
    'rejects a partial coverage version pair (%s, %s)',
    (calculationVersion, sourceVersion) => {
      expect(() => service.status(calculationVersion, sourceVersion)).toThrow(
        BadRequestException,
      );
      try {
        service.coverage('pilot-grid', calculationVersion, sourceVersion);
        throw new Error('El par parcial debio ser rechazado');
      } catch (caught) {
        expect(caught).toBeInstanceOf(BadRequestException);
        expect((caught as BadRequestException).getResponse()).toEqual({
          error: 'coverage_version_pair_required',
          required: ['calculationVersion', 'sourceVersion'],
        });
      }
    },
  );

  it('rejects versioned RAW without a source identity', () => {
    expect(() =>
      service.upsertVersionedHourlyRaw([
        {
          gridPointKey: 'pilot-grid',
          timestamp: '2026-08-20T00:00:00.000Z',
          provider: 'copernicus-cds',
          dataset: 'reanalysis-era5-land-timeseries',
          sourceVersion: '',
          values: {},
          qualityFlags: [],
          importedAt: '2026-08-28T00:00:00.000Z',
        },
      ]),
    ).toThrow(BadRequestException);
  });

  it('filters job pages by a trimmed calculation version', () => {
    service.jobs(
      '25',
      '5',
      ' chaman-meteo-agro-v2 ',
      ' era5-land-timeseries-19var-v2 ',
    );

    expect(repository.jobPage).toHaveBeenCalledWith(
      25,
      5,
      'chaman-meteo-agro-v2',
      'era5-land-timeseries-19var-v2',
    );
  });

  it('looks up an exact repair job and rejects an empty key', () => {
    service.jobByKey('repair-key');
    expect(repository.jobByKey).toHaveBeenCalledWith('repair-key');
    expect(() => service.jobByKey('   ')).toThrow(BadRequestException);
  });

  it('resuelve solamente bindings con tipo e id validos', () => {
    service.resolvedLocationBinding('lote', '64b000000000000000000010');
    expect(repository.resolvedLocationBinding).toHaveBeenCalledWith(
      'lote',
      '64b000000000000000000010',
    );
    expect(() =>
      service.resolvedLocationBinding('lote', 'no-es-object-id'),
    ).toThrow(BadRequestException);
    expect(() =>
      service.resolvedLocationBinding('otra-cosa', '64b000000000000000000010'),
    ).toThrow(BadRequestException);
  });
});
