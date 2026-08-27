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

@Injectable({ providedIn: 'root' })
export class ChamanMeteoService {
  constructor(private readonly http: HttpService) {}

  status(): Promise<IChamanMeteoAdminStatus> {
    return this.http.get('/chaman-meteo/status');
  }

  gridPoints(limit = 100): Promise<IChamanMeteoPage<IChamanMeteoGridPoint>> {
    return this.http.get('/chaman-meteo/grid-points', { params: { limit } });
  }

  jobs(limit = 25): Promise<IChamanMeteoPage<IChamanMeteoImportJob>> {
    return this.http.get('/chaman-meteo/jobs', { params: { limit } });
  }

  hourly(gridPointKey?: string, limit = 48): Promise<IChamanMeteoPage<IChamanMeteoHourlyDerived>> {
    return this.http.get('/chaman-meteo/hourly', {
      params: gridPointKey ? { gridPointKey, limit } : { limit },
    });
  }

  daily(gridPointKey?: string, limit = 30): Promise<IChamanMeteoPage<IChamanMeteoDaily>> {
    return this.http.get('/chaman-meteo/daily', {
      params: gridPointKey ? { gridPointKey, limit } : { limit },
    });
  }
}
