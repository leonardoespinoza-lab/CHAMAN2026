import { Injectable } from '@nestjs/common';
import {
  IChamanMeteoDaily,
  IChamanMeteoGridPoint,
  IChamanMeteoHourlyDerived,
  IChamanMeteoImportJob,
  IChamanMeteoPage,
  IChamanMeteoStorageStatus,
} from 'modelos/src';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { API_DATOS, CHAMAN_METEO_INTERNAL_TOKEN } from '../../env';

@Injectable()
export class ChamanMeteoRepository {
  constructor(private readonly axios: AxiosService) {}

  status(): Promise<IChamanMeteoStorageStatus> {
    return this.axios.GET(`${API_DATOS}/chaman-meteo-internal/status`, {
      headers: this.headers(),
    });
  }

  gridPoints(
    limit = 100,
    offset = 0,
  ): Promise<IChamanMeteoPage<IChamanMeteoGridPoint>> {
    return this.axios.GET(`${API_DATOS}/chaman-meteo-internal/grid-points`, {
      params: { limit, offset },
      headers: this.headers(),
    });
  }

  jobs(
    limit = 25,
    offset = 0,
  ): Promise<IChamanMeteoPage<IChamanMeteoImportJob>> {
    return this.axios.GET(`${API_DATOS}/chaman-meteo-internal/jobs`, {
      params: { limit, offset },
      headers: this.headers(),
    });
  }

  hourly(
    gridPointKey?: string,
    limit = 48,
    offset = 0,
    calculationVersion?: string,
  ): Promise<IChamanMeteoPage<IChamanMeteoHourlyDerived>> {
    return this.axios.GET(`${API_DATOS}/chaman-meteo-internal/hourly`, {
      params: { gridPointKey, limit, offset, calculationVersion },
      headers: this.headers(),
    });
  }

  daily(
    gridPointKey?: string,
    limit = 30,
    offset = 0,
    calculationVersion?: string,
  ): Promise<IChamanMeteoPage<IChamanMeteoDaily>> {
    return this.axios.GET(`${API_DATOS}/chaman-meteo-internal/daily`, {
      params: { gridPointKey, limit, offset, calculationVersion },
      headers: this.headers(),
    });
  }

  private headers(): Record<string, string> {
    return CHAMAN_METEO_INTERNAL_TOKEN
      ? { 'x-chaman-internal-token': CHAMAN_METEO_INTERNAL_TOKEN }
      : {};
  }
}
