import { Injectable } from '@angular/core';
import {
  ICreateTenant,
  IAdministradorInicialTenant,
  IListado,
  IQueryParam,
  ITenant,
  IUpdateTenant,
} from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({ providedIn: 'root' })
export class TenantService {
  constructor(private readonly http: HttpService) {}

  getFiltered(params?: IQueryParam): Promise<IListado<ITenant>> {
    return this.http.get('/tenants', { params });
  }

  getById(id: string): Promise<ITenant> {
    return this.http.get(`/tenants/${id}`);
  }

  getCurrent(): Promise<ITenant> {
    return this.http.get('/tenants/actual');
  }

  create(data: ICreateTenant): Promise<ITenant> {
    return this.http.post('/tenants', data);
  }

  update(id: string, data: IUpdateTenant): Promise<ITenant> {
    return this.http.put(`/tenants/${id}`, data);
  }

  archive(id: string): Promise<ITenant> {
    return this.http.delete(`/tenants/${id}`);
  }

  provision(id: string, data: IAdministradorInicialTenant): Promise<ITenant> {
    return this.http.post(`/tenants/${id}/provisionar`, data);
  }
}
