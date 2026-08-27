import { Injectable } from '@nestjs/common';
import { ChamanMeteoRepository } from './repository';

@Injectable()
export class ChamanMeteoService {
  constructor(private readonly repository: ChamanMeteoRepository) {}

  status() {
    return this.repository.status();
  }

  gridPoints(limit?: string, offset?: string) {
    return this.repository.gridPoints(this.number(limit), this.number(offset));
  }

  jobs(limit?: string, offset?: string) {
    return this.repository.jobs(this.number(limit), this.number(offset));
  }

  hourly(gridPointKey?: string, limit?: string, offset?: string) {
    return this.repository.hourly(
      String(gridPointKey || '').trim() || undefined,
      this.number(limit),
      this.number(offset),
    );
  }

  daily(gridPointKey?: string, limit?: string, offset?: string) {
    return this.repository.daily(
      String(gridPointKey || '').trim() || undefined,
      this.number(limit),
      this.number(offset),
    );
  }

  private number(value?: string): number | undefined {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
  }
}
