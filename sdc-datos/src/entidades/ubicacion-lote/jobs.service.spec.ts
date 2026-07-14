import { Logger } from '@nestjs/common';
import { GEOREF_SYNC_STARTUP_RETRY_MS } from '../../env';
import { LotLocationJobsService } from './jobs.service';

describe('LotLocationJobsService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('mantiene el proceso activo y reintenta si el bootstrap encuentra un lock', async () => {
    const syncService = {
      sync: jest
        .fn()
        .mockRejectedValueOnce(new Error('lock ocupado'))
        .mockResolvedValue({
          activated: false,
          snapshotId: 'snapshot-activo',
          sourceVersion: 'v1',
          counts: {},
        }),
    };
    const locationService = {
      backfill: jest.fn().mockResolvedValue({ total: 0, resolved: 0 }),
    };
    const establishmentLocationService = {
      backfill: jest.fn().mockResolvedValue({ total: 0, resolved: 0 }),
    };
    const jobs = new LotLocationJobsService(
      syncService as never,
      locationService as never,
      establishmentLocationService as never,
    );

    jobs['scheduleStartupAttempt'](0, 0);
    await jest.advanceTimersByTimeAsync(0);
    expect(syncService.sync).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(GEOREF_SYNC_STARTUP_RETRY_MS);
    expect(syncService.sync).toHaveBeenCalledTimes(2);
    expect(locationService.backfill).toHaveBeenCalledTimes(1);
    expect(establishmentLocationService.backfill).toHaveBeenCalledTimes(1);

    jobs.onModuleDestroy();
  });
});
