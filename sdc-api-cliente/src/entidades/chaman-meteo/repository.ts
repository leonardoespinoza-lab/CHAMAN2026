import { Injectable } from '@nestjs/common';
import {
  IChamanMeteoAdminStatus,
  IChamanMeteoDaily,
  IChamanMeteoGridPoint,
  IChamanMeteoHourlyDerived,
  IChamanMeteoImportJob,
  IChamanMeteoPage,
} from 'modelos/src';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { API_CLIMA, CHAMAN_METEO_INTERNAL_TOKEN } from '../../env';

@Injectable()
export class ChamanMeteoRepository {
  constructor(private readonly axios: AxiosService) {}

  status(): Promise<IChamanMeteoAdminStatus> {
    return this.axios.GET(`${API_CLIMA}/chaman-meteo/status`, {
      headers: this.headers(),
    });
  }

  gridPoints(
    limit?: number,
    offset?: number,
  ): Promise<IChamanMeteoPage<IChamanMeteoGridPoint>> {
    return this.axios.GET(`${API_CLIMA}/chaman-meteo/grid-points`, {
      params: { limit, offset },
      headers: this.headers(),
    });
  }

  jobs(
    limit?: number,
    offset?: number,
  ): Promise<IChamanMeteoPage<IChamanMeteoImportJob>> {
    return this.axios.GET(`${API_CLIMA}/chaman-meteo/jobs`, {
      params: { limit, offset },
      headers: this.headers(),
    });
  }

  hourly(
    gridPointKey?: string,
    limit?: number,
    offset?: number,
    from?: string,
    toExclusive?: string,
  ): Promise<IChamanMeteoPage<IChamanMeteoHourlyDerived>> {
    return this.axios.GET(`${API_CLIMA}/chaman-meteo/hourly`, {
      params: { gridPointKey, from, toExclusive, limit, offset },
      headers: this.headers(),
    });
  }

  daily(
    gridPointKey?: string,
    limit?: number,
    offset?: number,
    from?: string,
    toExclusive?: string,
  ): Promise<IChamanMeteoPage<IChamanMeteoDaily>> {
    return this.axios.GET(`${API_CLIMA}/chaman-meteo/daily`, {
      params: { gridPointKey, from, toExclusive, limit, offset },
      headers: this.headers(),
    });
  }

  private headers(): Record<string, string> {
    return CHAMAN_METEO_INTERNAL_TOKEN
      ? { 'x-chaman-internal-token': CHAMAN_METEO_INTERNAL_TOKEN }
      : {};
  }
}
