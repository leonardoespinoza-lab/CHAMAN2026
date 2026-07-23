import { Injectable } from '@nestjs/common';
import {
  ICreateTenant,
  IListado,
  IQueryParam,
  ISolicitudArchivado,
  ITenant,
  IUpdateTenant,
} from 'modelos/src';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { API_DATOS } from '../../env';

@Injectable()
export class TenantsRepository {
  constructor(private readonly axios: AxiosService) {}

  get(params: IQueryParam): Promise<IListado<ITenant>> {
    return this.axios.GET(`${API_DATOS}/tenants`, { params });
  }

  getById(id: string): Promise<ITenant> {
    return this.axios.GET(`${API_DATOS}/tenants/${id}`);
  }

  getBySlug(slug: string): Promise<ITenant> {
    return this.axios.GET(
      `${API_DATOS}/tenants/slug/${encodeURIComponent(slug)}`,
    );
  }

  create(data: ICreateTenant): Promise<ITenant> {
    return this.axios.POST(`${API_DATOS}/tenants`, data);
  }

  update(id: string, data: IUpdateTenant): Promise<ITenant> {
    return this.axios.PUT(`${API_DATOS}/tenants/${id}`, data);
  }

  archive(id: string, audit: ISolicitudArchivado): Promise<ITenant> {
    return this.axios.DELETE(`${API_DATOS}/tenants/${id}`, { params: audit });
  }
}
