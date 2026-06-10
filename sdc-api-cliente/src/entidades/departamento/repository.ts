import { Injectable } from '@nestjs/common';
import {
  IDepartamento,
  ICreateDepartamento,
  IListado,
  IQueryParam,
  IUpdateDepartamento,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class DepartamentosRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IDepartamento> {
    const url = `${API_DATOS}/departamentos/${id}`;
    return await this.axios.GET<IDepartamento>(url);
  }

  async get(params: IQueryParam): Promise<IListado<IDepartamento>> {
    const url = `${API_DATOS}/departamentos`;
    return await this.axios.GET<IListado<IDepartamento>>(url, { params });
  }

  async create(data: ICreateDepartamento): Promise<IDepartamento> {
    const url = `${API_DATOS}/departamentos`;
    return await this.axios.POST<IDepartamento>(url, data);
  }

  async bulk(data: ICreateDepartamento[]): Promise<void> {
    const url = `${API_DATOS}/departamentos/bulk`;
    return await this.axios.POST<void>(url, data);
  }

  async update(id: string, data: IUpdateDepartamento): Promise<IDepartamento> {
    const url = `${API_DATOS}/departamentos/${id}`;
    return await this.axios.PUT<IDepartamento>(url, data);
  }

  async delete(id: string): Promise<IDepartamento> {
    const url = `${API_DATOS}/departamentos/${id}`;
    return await this.axios.DELETE<IDepartamento>(url);
  }
}
