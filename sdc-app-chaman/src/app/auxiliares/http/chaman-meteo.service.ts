import { Injectable } from '@angular/core';
import {
  IChamanMeteoAdminStatus,
  IChamanMeteoDaily,
  IChamanMeteoGridPoint,
  IChamanMeteoHourlyDerived,
  IChamanMeteoImportJob,
  IChamanMeteoPage,
} from 'modelos/src';
import { HttpService } from './http.service';

export interface ChamanMeteoHistoryQuery {
  gridPointKey?: string;
  from?: string;
  toExclusive?: string;
  limit?: number;
  offset?: number;
}

@Injectable({ providedIn: 'root' })
export class ChamanMeteoService {
  constructor(private readonly http: HttpService) {}

  status(): Promise<IChamanMeteoAdminStatus> {
    return this.http.get('/chaman-meteo/status');
  }

  gridPoints(limit = 500, offset = 0): Promise<IChamanMeteoPage<IChamanMeteoGridPoint>> {
    return this.http.get('/chaman-meteo/grid-points', { params: { limit, offset } });
  }

  jobs(limit = 25): Promise<IChamanMeteoPage<IChamanMeteoImportJob>> {
    return this.http.get('/chaman-meteo/jobs', { params: { limit } });
  }

  hourly(gridPointKey?: string, limit = 48): Promise<IChamanMeteoPage<IChamanMeteoHourlyDerived>> {
    return this.hourlyHistory({ gridPointKey, limit });
  }

  daily(gridPointKey?: string, limit = 30): Promise<IChamanMeteoPage<IChamanMeteoDaily>> {
    return this.dailyHistory({ gridPointKey, limit });
  }

  hourlyHistory(query: ChamanMeteoHistoryQuery): Promise<IChamanMeteoPage<IChamanMeteoHourlyDerived>> {
    return this.http.get('/chaman-meteo/hourly', { params: this.params(query) });
  }

  dailyHistory(query: ChamanMeteoHistoryQuery): Promise<IChamanMeteoPage<IChamanMeteoDaily>> {
    return this.http.get('/chaman-meteo/daily', {
      params: this.params(query),
    });
  }

  private params(query: ChamanMeteoHistoryQuery): Record<string, string | number> {
    return Object.fromEntries(
      Object.entries(query).filter(([, value]) => value !== undefined && value !== ''),
    ) as Record<string, string | number>;
  }
}
