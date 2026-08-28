import { Injectable } from '@nestjs/common';
import {
  IChamanMeteoDaily,
  IChamanMeteoGridPoint,
  IChamanMeteoHourlyDerived,
  IChamanMeteoImportJob,
  IChamanMeteoPage,
  IChamanMeteoResolvedLocationBinding,
  IChamanMeteoStorageStatus,
} from 'modelos/src';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { API_DATOS, CHAMAN_METEO_INTERNAL_TOKEN } from '../../env';

@Injectable()
export class ChamanMeteoRepository {
  constructor(private readonly axios: AxiosService) {}

  status(
    calculationVersion?: string,
    sourceVersion?: string,
  ): Promise<IChamanMeteoStorageStatus> {
    return this.axios.GET(`${API_DATOS}/chaman-meteo-internal/status`, {
      params: { calculationVersion, sourceVersion },
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

  resolvedLocationBinding(
    locationType: 'establecimiento' | 'lote',
    locationId: string,
  ): Promise<IChamanMeteoResolvedLocationBinding | null> {
    return this.axios.GET(
      `${API_DATOS}/chaman-meteo-internal/bindings/${locationType}/${encodeURIComponent(locationId)}`,
      { headers: this.headers() },
    );
  }

  jobs(
    limit = 25,
    offset = 0,
    calculationVersion?: string,
    sourceVersion?: string,
  ): Promise<IChamanMeteoPage<IChamanMeteoImportJob>> {
    return this.axios.GET(`${API_DATOS}/chaman-meteo-internal/jobs`, {
      params: { limit, offset, calculationVersion, sourceVersion },
      headers: this.headers(),
    });
  }

  hourly(
    gridPointKey?: string,
    limit = 48,
    offset = 0,
    calculationVersion?: string,
    from?: string,
    toExclusive?: string,
  ): Promise<IChamanMeteoPage<IChamanMeteoHourlyDerived>> {
    return this.axios.GET(`${API_DATOS}/chaman-meteo-internal/hourly`, {
      params: {
        gridPointKey,
        from,
        toExclusive,
        limit,
        offset,
        calculationVersion,
      },
      headers: this.headers(),
    });
  }

  daily(
    gridPointKey?: string,
    limit = 30,
    offset = 0,
    calculationVersion?: string,
    from?: string,
    toExclusive?: string,
  ): Promise<IChamanMeteoPage<IChamanMeteoDaily>> {
    return this.axios.GET(`${API_DATOS}/chaman-meteo-internal/daily`, {
      params: {
        gridPointKey,
        from,
        toExclusive,
        limit,
        offset,
        calculationVersion,
      },
      headers: this.headers(),
    });
  }

  private headers(): Record<string, string> {
    return CHAMAN_METEO_INTERNAL_TOKEN
      ? { 'x-chaman-internal-token': CHAMAN_METEO_INTERNAL_TOKEN }
      : {};
  }
}
