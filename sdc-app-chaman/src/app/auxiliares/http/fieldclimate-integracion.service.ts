import { Injectable } from '@angular/core';
import { IEstablecimiento, IEstacion, IListado, IQueryParam } from 'modelos/src';
import { HttpService } from './http.service';

export interface FieldClimateCredentials {
  username: string;
  password: string;
}

export interface FieldClimateStationPreview {
  idExterno: string;
  name?: {
    original?: string;
    custom?: string;
  };
  info?: {
    device_name?: string;
    uid?: string;
    description?: string;
  };
  dates?: {
    last_communication?: string;
    max_date?: string;
  };
  position?: {
    geo?: {
      coordinates?: [number, number];
    };
    timezoneCode?: string;
  };
  meta?: Record<string, any>;
  rights?: string;
}

@Injectable({
  providedIn: 'root',
})
export class FieldClimateIntegracionService {
  constructor(private http: HttpService) {}

  public descubrir(credentials: FieldClimateCredentials): Promise<FieldClimateStationPreview[]> {
    return this.http.post('/fieldclimate-integraciones/descubrir', credentials);
  }

  public importar(
    data: FieldClimateCredentials & { stationId: string; idEstablecimiento?: string }
  ): Promise<IEstacion> {
    return this.http.post('/fieldclimate-integraciones/importar', data);
  }

  public listarCentrales(params?: IQueryParam): Promise<IListado<IEstacion>> {
    return this.http.get('/fieldclimate-integraciones/centrales', { params });
  }

  public listarEstablecimientos(params?: IQueryParam): Promise<IListado<IEstablecimiento>> {
    return this.http.get('/fieldclimate-integraciones/establecimientos', { params });
  }

  public asignar(idCentral: string, idEstablecimiento: string): Promise<IEstacion> {
    return this.http.put(`/fieldclimate-integraciones/centrales/${idCentral}/asignar`, { idEstablecimiento });
  }

  public sincronizar(idCentral: string): Promise<IEstacion> {
    return this.http.post(`/fieldclimate-integraciones/centrales/${idCentral}/sincronizar`, {});
  }
}
