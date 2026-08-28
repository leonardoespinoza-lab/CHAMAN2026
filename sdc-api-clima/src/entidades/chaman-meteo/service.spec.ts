import { BadRequestException } from '@nestjs/common';
import {
  CHAMAN_METEO_CALCULATION_VERSION,
  CHAMAN_METEO_HISTORICAL_START,
  CHAMAN_METEO_SOURCE_VERSION,
} from '../../env';
import { ChamanMeteoService, chamanMeteoAdminState } from './service';

describe('ChamanMeteoService', () => {
  const repository = {
    status: jest.fn(),
    jobs: jest.fn(),
    hourly: jest.fn(),
    daily: jest.fn(),
  };
  const service = new ChamanMeteoService(repository as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests storage status for the active calculation version', async () => {
    repository.status.mockResolvedValue({
      calculationVersion: CHAMAN_METEO_CALCULATION_VERSION,
      sourceVersion: CHAMAN_METEO_SOURCE_VERSION,
      jobsByStatus: { DOWNLOADING: 0, FAILED: 0 },
      hourlyDerivedRecords: 0,
      dailyRecords: 0,
    });

    await service.status();

    expect(repository.status).toHaveBeenCalledWith(
      CHAMAN_METEO_CALCULATION_VERSION,
      CHAMAN_METEO_SOURCE_VERSION,
    );
  });

  it.each(['PARTIAL', 'FAILED'] as const)(
    'surfaces a latest %s job as an error even when data exists',
    (status) => {
      expect(
        chamanMeteoAdminState(true, {
          jobsByStatus: {
            PENDING: 0,
            DOWNLOADING: 0,
            PARTIAL: status === 'PARTIAL' ? 1 : 0,
            AVAILABLE: 1,
            FAILED: status === 'FAILED' ? 1 : 0,
          },
          gridPoints: 1,
          activeBindings: 1,
          hourlyRawRecords: 24,
          hourlyDerivedRecords: 24,
          dailyRecords: 1,
          latestJob: {
            jobKey: 'latest',
            type: 'REPAIR',
            rangeStart: '2026-08-01',
            rangeEnd: '2026-08-01',
            status,
            progressPct: 55,
            attempts: 1,
          },
        }),
      ).toBe('ERROR');
    },
  );

  it('keeps READY for a configured integration without jobs or data', () => {
    expect(
      chamanMeteoAdminState(
        true,
        {
          jobsByStatus: {
            PENDING: 0,
            DOWNLOADING: 0,
            PARTIAL: 0,
            AVAILABLE: 0,
            FAILED: 0,
          },
          gridPoints: 0,
          activeBindings: 0,
          hourlyRawRecords: 0,
          hourlyDerivedRecords: 0,
          dailyRecords: 0,
        },
        true,
      ),
    ).toBe('READY');
  });

  it('keeps any unresolved partial or failed job visible even if the latest job is available', () => {
    expect(
      chamanMeteoAdminState(true, {
        jobsByStatus: {
          PENDING: 0,
          DOWNLOADING: 0,
          PARTIAL: 0,
          AVAILABLE: 1,
          FAILED: 1,
        },
        gridPoints: 2,
        activeBindings: 2,
        hourlyRawRecords: 48,
        hourlyDerivedRecords: 48,
        dailyRecords: 2,
        latestJob: {
          jobKey: 'available-latest',
          type: 'BACKFILL',
          rangeStart: '2026-08-02',
          rangeEnd: '2026-08-02',
          status: 'AVAILABLE',
          progressPct: 100,
          attempts: 1,
        },
      }),
    ).toBe('ERROR');
  });

  it('reports an isolated configuration error without requiring storage', () => {
    expect(
      chamanMeteoAdminState(
        true,
        {
          jobsByStatus: {
            PENDING: 0,
            DOWNLOADING: 0,
            PARTIAL: 0,
            AVAILABLE: 0,
            FAILED: 0,
          },
          gridPoints: 0,
          activeBindings: 0,
          hourlyRawRecords: 0,
          hourlyDerivedRecords: 0,
          dailyRecords: 0,
        },
        true,
        false,
      ),
    ).toBe('ERROR');
  });

  it('exposes the latest diagnostic and pins jobs to the active version', async () => {
    repository.status.mockResolvedValue({
      calculationVersion: CHAMAN_METEO_CALCULATION_VERSION,
      sourceVersion: CHAMAN_METEO_SOURCE_VERSION,
      jobsByStatus: {
        PENDING: 0,
        DOWNLOADING: 0,
        PARTIAL: 1,
        AVAILABLE: 0,
        FAILED: 0,
      },
      hourlyDerivedRecords: 0,
      dailyRecords: 0,
      latestJob: { status: 'PARTIAL', lastError: 'serie incompleta' },
      latestProblemJob: {
        status: 'PARTIAL',
        lastError: 'serie incompleta',
      },
    });

    await expect(service.status()).resolves.toMatchObject({
      lastError: 'serie incompleta',
    });
    service.jobs('25', '5');

    expect(repository.jobs).toHaveBeenCalledWith(
      25,
      5,
      CHAMAN_METEO_CALCULATION_VERSION,
      CHAMAN_METEO_SOURCE_VERSION,
    );
  });

  it('fails closed when an older storage service does not confirm v2 versions', async () => {
    repository.status.mockResolvedValue({
      jobsByStatus: {
        PENDING: 0,
        DOWNLOADING: 0,
        PARTIAL: 0,
        AVAILABLE: 1,
        FAILED: 0,
      },
      gridPoints: 1,
      activeBindings: 1,
      hourlyRawRecords: 24,
      hourlyDerivedRecords: 24,
      dailyRecords: 1,
    });

    await expect(service.status()).resolves.toMatchObject({
      configurationValid: false,
      credentialConfigured: false,
      hourlyRawRecords: 0,
      hourlyDerivedRecords: 0,
      dailyRecords: 0,
      calculationVersion: CHAMAN_METEO_CALCULATION_VERSION,
      sourceVersion: CHAMAN_METEO_SOURCE_VERSION,
      lastError: expect.stringContaining('contrato versionado'),
    });
  });

  it('forwards the hourly range while pinning the calculation version', () => {
    service.hourly(
      'pilot-grid',
      '48',
      '5',
      '2026-08-01T00:00:00Z',
      '2026-09-01T00:00:00Z',
    );

    expect(repository.hourly).toHaveBeenCalledWith(
      'pilot-grid',
      48,
      5,
      CHAMAN_METEO_CALCULATION_VERSION,
      '2026-08-01T00:00:00Z',
      '2026-09-01T00:00:00Z',
    );
  });

  it('forwards the daily range with unchanged defaults and pinned version', () => {
    service.daily(
      'pilot-grid',
      undefined,
      undefined,
      '2026-08-01',
      '2026-09-01',
    );

    expect(repository.daily).toHaveBeenCalledWith(
      'pilot-grid',
      30,
      0,
      CHAMAN_METEO_CALCULATION_VERSION,
      '2026-08-01',
      '2026-09-01',
    );
  });

  it.each([
    ['hourly', '2019-12-31T23:59:59.999Z'],
    ['daily', '2019-12-31'],
  ] as const)(
    'rejects %s history before the configured business limit',
    (grain, from) => {
      let error: BadRequestException | undefined;

      try {
        service[grain]('pilot-grid', undefined, undefined, from);
      } catch (caught) {
        error = caught as BadRequestException;
      }

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error?.getResponse()).toEqual({
        error: 'historical_data_before_limit',
        historical_available_from: CHAMAN_METEO_HISTORICAL_START,
      });
      expect(repository[grain]).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['hourly', '2019-12-31T23:59:59.999Z'],
    ['daily', '2019-12-31'],
  ] as const)(
    'rejects %s ranges ending entirely before the historical limit',
    (grain, toExclusive) => {
      expect(() =>
        service[grain](
          'pilot-grid',
          undefined,
          undefined,
          undefined,
          toExclusive,
        ),
      ).toThrow(BadRequestException);

      expect(repository[grain]).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['hourly', 'not-an-iso-date'],
    ['daily', '2019-02-30'],
  ] as const)(
    'keeps malformed %s dates delegated to the storage validation',
    (grain, from) => {
      service[grain]('pilot-grid', undefined, undefined, from);

      expect(repository[grain]).toHaveBeenCalled();
    },
  );
});
