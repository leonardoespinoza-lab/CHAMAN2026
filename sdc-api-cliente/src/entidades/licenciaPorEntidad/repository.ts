import { Injectable } from '@nestjs/common';
import {
  ILicenciaPorEntidad,
  IListado,
  IQueryParam,
  ICreateLicenciaPorEntidad,
  IUpdateLicenciaPorEntidad,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class LicenciaPorEntidadsRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<ILicenciaPorEntidad> {
    const url = `${API_DATOS}/licenciaporentidads/${id}`;
    return await this.axios.GET<ILicenciaPorEntidad>(url);
  }

  async get(params: IQueryParam): Promise<IListado<ILicenciaPorEntidad>> {
    const url = `${API_DATOS}/licenciaporentidads`;
    return await this.axios.GET<IListado<ILicenciaPorEntidad>>(url, { params });
  }

  async create(data: ICreateLicenciaPorEntidad): Promise<ILicenciaPorEntidad> {
    const url = `${API_DATOS}/licenciaporentidads`;
    return await this.axios.POST<ILicenciaPorEntidad>(url, data);
  }

  async update(
    id: string,
    data: IUpdateLicenciaPorEntidad,
  ): Promise<ILicenciaPorEntidad> {
    const url = `${API_DATOS}/licenciaporentidads/${id}`;
    return await this.axios.PUT<ILicenciaPorEntidad>(url, data);
  }

  async delete(id: string): Promise<ILicenciaPorEntidad> {
    const url = `${API_DATOS}/licenciaporentidads/${id}`;
    return await this.axios.DELETE<ILicenciaPorEntidad>(url);
  }
}
