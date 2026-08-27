import { BadRequestException, Injectable } from '@nestjs/common';
import {
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

  status() {
    return this.repository.status();
  }

  gridPoints(limit?: string, offset?: string) {
    return this.repository.gridPointPage(
      this.bounded(limit, 50, 1, 500),
      this.bounded(offset, 0, 0, 1_000_000),
    );
  }

  jobs(limit?: string, offset?: string) {
    return this.repository.jobPage(
      this.bounded(limit, 25, 1, 200),
      this.bounded(offset, 0, 0, 1_000_000),
    );
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
  ) {
    return this.repository.dailyPage(
      this.cleanKey(gridPointKey),
      this.cleanKey(calculationVersion),
      this.bounded(limit, 30, 1, 500),
      this.bounded(offset, 0, 0, 1_000_000),
    );
  }

  coverage(gridPointKey: string) {
    const key = this.cleanKey(gridPointKey);
    if (!key) throw new BadRequestException('gridPointKey requerido.');
    return this.repository.coverageByGridPoint(key);
  }

  upsertGridPoint(data: IChamanMeteoGridPoint): Promise<any> {
    if (
      !data?.key ||
      !Number.isFinite(data.latitude) ||
      !Number.isFinite(data.longitude) ||
      !this.validHistoricalStart(data.historicalStart)
    ) {
      throw new BadRequestException('Punto meteorologico incompleto.');
    }
    return this.repository.upsertGridPoint(data);
  }

  upsertHourlyRaw(data: IChamanMeteoHourlyRaw[]): Promise<any> {
    return this.repository.upsertHourlyRaw(data || []);
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
    return this.repository.upsertCoverage(gridPointKey, data || {});
  }

  recalculateCoverage(gridPointKey: string): Promise<any> {
    const key = this.cleanKey(gridPointKey);
    if (!key) throw new BadRequestException('gridPointKey requerido.');
    return this.repository.recalculateCoverage(key);
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
    const minimum = new Date('1950-01-02T00:00:00.000Z');
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    return parsed >= minimum && parsed < tomorrow;
  }
}
