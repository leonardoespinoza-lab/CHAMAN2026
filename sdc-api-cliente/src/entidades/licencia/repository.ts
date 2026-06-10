import { Injectable } from '@nestjs/common';
import {
  ILicencia,
  IListado,
  IQueryParam,
  ICreateLicencia,
  IUpdateLicencia,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class LicenciasRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<ILicencia> {
    const url = `${API_DATOS}/licencias/${id}`;
    return await this.axios.GET<ILicencia>(url);
  }

  async get(params: IQueryParam): Promise<IListado<ILicencia>> {
    const url = `${API_DATOS}/licencias`;
    return await this.axios.GET<IListado<ILicencia>>(url, { params });
  }

  async create(data: ICreateLicencia): Promise<ILicencia> {
    const url = `${API_DATOS}/licencias`;
    return await this.axios.POST<ILicencia>(url, data);
  }

  async update(id: string, data: IUpdateLicencia): Promise<ILicencia> {
    const url = `${API_DATOS}/licencias/${id}`;
    return await this.axios.PUT<ILicencia>(url, data);
  }

  async delete(id: string): Promise<ILicencia> {
    const url = `${API_DATOS}/licencias/${id}`;
    return await this.axios.DELETE<ILicencia>(url);
  }
}
