import { Injectable } from '@angular/core';
import {
  API_SERVICES,
  API_SERVICE_CATALOG,
  ApiClientView,
  ApiEnvironment,
  ApiRegistration,
  ApiSettings,
  ApiUsageReport,
} from 'modelos/src';
import { HttpService } from './http.service';

export interface IntegrationAdminList {
  items: ApiClientView[];
  truncated: boolean;
  environment: ApiEnvironment;
  apiEnabled: boolean;
  registrySource: string;
  baseUrl: string;
  services: typeof API_SERVICES;
  serviceCatalog?: typeof API_SERVICE_CATALOG;
}
export interface IntegrationOperator {
  id: string;
  username: string;
  permissions: { index: number; rol: string; nivel: string }[];
}
@Injectable({ providedIn: 'root' })
export class IntegrationAdminService {
  private readonly path = '/admin/integraciones';
  constructor(private readonly http: HttpService) {}
  list(): Promise<IntegrationAdminList> {
    return this.http.get(this.path);
  }
  operator(username: string): Promise<IntegrationOperator> {
    return this.http.get(this.path + '/operador', { params: { username } });
  }
  create(data: ApiRegistration): Promise<ApiClientView> {
    return this.http.post(this.path, data);
  }
  update(id: string, revision: number, settings: ApiSettings): Promise<ApiClientView> {
    return this.http.put(`${this.path}/${id}`, { revision, settings });
  }
  key(id: string, revision: number): Promise<{ client: ApiClientView; credential: string }> {
    return this.http.post(`${this.path}/${id}/claves`, { revision });
  }
  revoke(id: string, keyId: string, revision: number): Promise<ApiClientView> {
    return this.http.post(`${this.path}/${id}/claves/${keyId}/revocar`, { revision });
  }
  usage(id: string, days: number): Promise<ApiUsageReport> {
    return this.http.get(`${this.path}/${id}/consumo`, { params: { days } });
  }
}
