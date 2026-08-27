import { Injectable } from '@nestjs/common';
import {
  IChamanMeteoAdminStatus,
  IChamanMeteoStorageStatus,
} from 'modelos/src';
import {
  CHAMAN_METEO_CALCULATION_VERSION,
  CHAMAN_METEO_CDS_CONFIGURED,
  CHAMAN_METEO_ENABLED,
  CHAMAN_METEO_HISTORICAL_START,
  CHAMAN_METEO_IMPORT_ENABLED,
} from '../../env';
import { ChamanMeteoRepository } from './repository';

@Injectable()
export class ChamanMeteoService {
  constructor(private readonly repository: ChamanMeteoRepository) {}

  async status(): Promise<IChamanMeteoAdminStatus> {
    const storage = await this.repository.status();
    const importing = storage.jobsByStatus.DOWNLOADING > 0;
    const available =
      storage.hourlyDerivedRecords > 0 || storage.dailyRecords > 0;
    const failedWithoutData = storage.jobsByStatus.FAILED > 0 && !available;
    const configured =
      CHAMAN_METEO_CDS_CONFIGURED ||
      importing ||
      available ||
      !!storage.latestJob;
    return {
      ...storage,
      service: 'Chaman-Meteo',
      enabled: CHAMAN_METEO_ENABLED,
      importEnabled: CHAMAN_METEO_IMPORT_ENABLED,
      credentialConfigured: configured,
      provider: 'Copernicus Climate Data Store',
      dataset: 'ERA5-Land time-series',
      historicalStart: CHAMAN_METEO_HISTORICAL_START,
      calculationVersion: CHAMAN_METEO_CALCULATION_VERSION,
      operationalSourceUnchanged: true,
      state: !CHAMAN_METEO_ENABLED
        ? 'DISABLED'
        : failedWithoutData
          ? 'ERROR'
          : importing
            ? 'IMPORTING'
            : available
              ? 'AVAILABLE'
              : configured
                ? 'READY'
                : 'DISABLED',
      checkedAt: new Date().toISOString(),
    };
  }

  gridPoints(limit?: string, offset?: string) {
    return this.repository.gridPoints(
      this.number(limit, 100, 1, 500),
      this.number(offset, 0, 0, 1_000_000),
    );
  }

  jobs(limit?: string, offset?: string) {
    return this.repository.jobs(
      this.number(limit, 25, 1, 200),
      this.number(offset, 0, 0, 1_000_000),
    );
  }

  hourly(gridPointKey?: string, limit?: string, offset?: string) {
    return this.repository.hourly(
      gridPointKey,
      this.number(limit, 48, 1, 500),
      this.number(offset, 0, 0, 1_000_000),
    );
  }

  daily(gridPointKey?: string, limit?: string, offset?: string) {
    return this.repository.daily(
      gridPointKey,
      this.number(limit, 30, 1, 500),
      this.number(offset, 0, 0, 1_000_000),
    );
  }

  private number(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const parsed = Number(value);
    return Number.isInteger(parsed)
      ? Math.min(max, Math.max(min, parsed))
      : fallback;
  }
}
