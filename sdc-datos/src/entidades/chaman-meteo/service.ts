import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CHAMAN_METEO_MIN_HISTORICAL_DATE,
  IChamanMeteoCoverage,
  IChamanMeteoDaily,
  IChamanMeteoGridPoint,
  IChamanMeteoHourlyDerived,
  IChamanMeteoHourlyRaw,
  IChamanMeteoImportJob,
} from 'modelos/src';
import { ChamanMeteoRepository } from './repository';

@Injectable()
export class ChamanMeteoService {
  constructor(private readonly repository: ChamanMeteoRepository) {}

  status(calculationVersion?: string, sourceVersion?: string) {
    const versions = this.coverageVersions(calculationVersion, sourceVersion);
    return this.repository.status(
      versions.calculationVersion,
      versions.sourceVersion,
    );
  }

  gridPoints(limit?: string, offset?: string) {
    return this.repository.gridPointPage(
      this.bounded(limit, 50, 1, 500),
      this.bounded(offset, 0, 0, 1_000_000),
    );
  }

  jobs(
    limit?: string,
    offset?: string,
    calculationVersion?: string,
    sourceVersion?: string,
  ) {
    const versions = this.coverageVersions(calculationVersion, sourceVersion);
    return this.repository.jobPage(
      this.bounded(limit, 25, 1, 200),
      this.bounded(offset, 0, 0, 1_000_000),
      versions.calculationVersion,
      versions.sourceVersion,
    );
  }

  jobByKey(jobKey?: string) {
    const key = this.cleanKey(jobKey);
    if (!key) throw new BadRequestException('jobKey requerido.');
    return this.repository.jobByKey(key);
  }

  hourly(
    gridPointKey?: string,
    from?: string,
    toExclusive?: string,
    calculationVersion?: string,
    limit?: string,
    offset?: string,
  ) {
    const fromDate = this.cleanDate(from, 'from');
    const toDate = this.cleanDate(toExclusive, 'toExclusive');
    this.assertHistoricalLimit(fromDate);
    if (fromDate && toDate && fromDate >= toDate) {
      throw new BadRequestException('from debe ser anterior a toExclusive.');
    }
    return this.repository.hourlyPage(
      this.cleanKey(gridPointKey),
      fromDate,
      toDate,
      this.cleanKey(calculationVersion),
      this.bounded(limit, 48, 1, 500),
      this.bounded(offset, 0, 0, 1_000_000),
    );
  }

  daily(
    gridPointKey?: string,
    calculationVersion?: string,
    limit?: string,
    offset?: string,
    from?: string,
    toExclusive?: string,
  ) {
    const fromDate = this.cleanCalendarDate(from, 'from');
    const toDate = this.cleanCalendarDate(toExclusive, 'toExclusive');
    this.assertHistoricalLimit(fromDate);
    if (fromDate && toDate && fromDate >= toDate) {
      throw new BadRequestException('from debe ser anterior a toExclusive.');
    }
    return this.repository.dailyPage(
      this.cleanKey(gridPointKey),
      this.cleanKey(calculationVersion),
      this.bounded(limit, 30, 1, 500),
      this.bounded(offset, 0, 0, 1_000_000),
      fromDate,
      toDate,
    );
  }

  coverage(
    gridPointKey: string,
    calculationVersion?: string,
    sourceVersion?: string,
  ) {
    const key = this.cleanKey(gridPointKey);
    if (!key) throw new BadRequestException('gridPointKey requerido.');
    const versions = this.coverageVersions(calculationVersion, sourceVersion);
    return this.repository.coverageByGridPoint(
      key,
      versions.calculationVersion,
      versions.sourceVersion,
    );
  }

  upsertGridPoint(data: IChamanMeteoGridPoint): Promise<any> {
    const key = this.cleanKey(data?.key);
    const countryCode = String(data?.countryCode || '')
      .trim()
      .toUpperCase();
    const timezone = String(data?.timezone || '').trim();
    if (
      !key ||
      !Number.isFinite(data.latitude) ||
      !Number.isFinite(data.longitude) ||
      data.latitude < -90 ||
      data.latitude > 90 ||
      data.longitude < -180 ||
      data.longitude > 180 ||
      !['AR', 'UY', 'PY', 'BR', 'CL'].includes(countryCode) ||
      !this.validTimezone(timezone) ||
      data.provider !== 'copernicus-cds' ||
      data.dataset !== 'reanalysis-era5-land-timeseries' ||
      !this.validHistoricalStart(data.historicalStart)
    ) {
      throw new BadRequestException('Punto meteorologico incompleto.');
    }
    return this.repository.upsertGridPoint({
      ...data,
      key,
      countryCode: countryCode as IChamanMeteoGridPoint['countryCode'],
      timezone,
    });
  }

  upsertHourlyRaw(data: IChamanMeteoHourlyRaw[]): Promise<any> {
    return this.repository.upsertHourlyRaw(data || []);
  }

  upsertVersionedHourlyRaw(data: IChamanMeteoHourlyRaw[]): Promise<any> {
    const records = data || [];
    if (
      records.some(
        (record) =>
          !this.cleanKey(record?.gridPointKey) ||
          !this.cleanKey(record?.sourceVersion),
      )
    ) {
      throw new BadRequestException({
        error: 'versioned_raw_identity_required',
        required: ['gridPointKey', 'sourceVersion'],
      });
    }
    return this.repository.upsertVersionedHourlyRaw(records);
  }

  upsertHourlyDerived(data: IChamanMeteoHourlyDerived[]): Promise<any> {
    return this.repository.upsertHourlyDerived(data || []);
  }

  upsertDaily(data: IChamanMeteoDaily[]): Promise<any> {
    return this.repository.upsertDaily(data || []);
  }

  upsertJob(data: IChamanMeteoImportJob): Promise<any> {
    if (!data?.jobKey) throw new BadRequestException('jobKey requerido.');
    return this.repository.upsertJob(data);
  }

  upsertCoverage(
    gridPointKey: string,
    data: Partial<IChamanMeteoCoverage>,
  ): Promise<any> {
    if (!this.cleanKey(gridPointKey)) {
      throw new BadRequestException('gridPointKey requerido.');
    }
    const versions = this.coverageVersions(
      data?.calculationVersion,
      data?.sourceVersion,
    );
    return this.repository.upsertCoverage(
      gridPointKey,
      data || {},
      versions.calculationVersion,
      versions.sourceVersion,
    );
  }

  recalculateCoverage(
    gridPointKey: string,
    calculationVersion?: string,
    sourceVersion?: string,
  ): Promise<any> {
    const key = this.cleanKey(gridPointKey);
    if (!key) throw new BadRequestException('gridPointKey requerido.');
    const versions = this.coverageVersions(calculationVersion, sourceVersion);
    return this.repository.recalculateCoverage(
      key,
      versions.calculationVersion,
      versions.sourceVersion,
    );
  }

  private coverageVersions(
    calculationVersion?: string,
    sourceVersion?: string,
  ): { calculationVersion?: string; sourceVersion?: string } {
    const calculation = this.cleanKey(calculationVersion);
    const source = this.cleanKey(sourceVersion);
    if (Boolean(calculation) !== Boolean(source)) {
      throw new BadRequestException({
        error: 'coverage_version_pair_required',
        required: ['calculationVersion', 'sourceVersion'],
      });
    }
    return { calculationVersion: calculation, sourceVersion: source };
  }

  private bounded(
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

  private cleanKey(value?: string): string | undefined {
    const key = String(value || '').trim();
    return key || undefined;
  }

  private cleanDate(
    value: string | undefined,
    field: string,
  ): Date | undefined {
    const text = String(value || '').trim();
    if (!text) return undefined;
    const parsed = new Date(text);
    if (!Number.isFinite(parsed.getTime())) {
      throw new BadRequestException(`${field} debe ser una fecha ISO valida.`);
    }
    return parsed;
  }

  private cleanCalendarDate(
    value: string | undefined,
    field: string,
  ): string | undefined {
    const text = String(value || '').trim();
    if (!text) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      throw new BadRequestException(
        `${field} debe ser una fecha valida con formato YYYY-MM-DD.`,
      );
    }
    const parsed = new Date(`${text}T00:00:00.000Z`);
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== text
    ) {
      throw new BadRequestException(
        `${field} debe ser una fecha valida con formato YYYY-MM-DD.`,
      );
    }
    return text;
  }

  private validHistoricalStart(value: string | undefined): boolean {
    const text = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const parsed = new Date(`${text}T00:00:00.000Z`);
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== text
    ) {
      return false;
    }
    const minimum = new Date(
      `${CHAMAN_METEO_MIN_HISTORICAL_DATE}T00:00:00.000Z`,
    );
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    return parsed >= minimum && parsed < tomorrow;
  }

  private validTimezone(value: string | undefined): boolean {
    const timezone = String(value || '').trim();
    if (!timezone) return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
      return true;
    } catch {
      return false;
    }
  }

  private assertHistoricalLimit(value?: Date | string): void {
    if (!value) return;
    const instant =
      value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
    const minimum = new Date(
      `${CHAMAN_METEO_MIN_HISTORICAL_DATE}T00:00:00.000Z`,
    );
    if (instant < minimum) {
      throw new BadRequestException({
        error: 'historical_data_before_limit',
        historical_available_from: CHAMAN_METEO_MIN_HISTORICAL_DATE,
      });
    }
  }
}
