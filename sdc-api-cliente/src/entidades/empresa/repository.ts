import { Injectable } from '@nestjs/common';
import {
  IEmpresa,
  ICreateEmpresa,
  IListado,
  IQueryParam,
  IUpdateEmpresa,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class EmpresasRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IEmpresa> {
    const url = `${API_DATOS}/empresas/${id}`;
    return await this.axios.GET<IEmpresa>(url);
  }

  async getByNombre(nombre: string): Promise<IEmpresa> {
    const url = `${API_DATOS}/empresas/nombre/${nombre}`;
    return await this.axios.GET<IEmpresa>(url);
  }

  async get(filtro: IQueryParam): Promise<IListado<IEmpresa>> {
    const url = `${API_DATOS}/empresas`;
    return await this.axios.GET<IListado<IEmpresa>>(url, {
      params: filtro,
    });
  }

  async create(data: ICreateEmpresa): Promise<IEmpresa> {
    const url = `${API_DATOS}/empresas`;
    return await this.axios.POST<IEmpresa>(url, data);
  }

  async bulk(data: ICreateEmpresa[]): Promise<void> {
    const url = `${API_DATOS}/empresas/bulk`;
    return await this.axios.POST<void>(url, data);
  }

  async update(id: string, data: IUpdateEmpresa): Promise<IEmpresa> {
    const url = `${API_DATOS}/empresas/${id}`;
    return await this.axios.PUT<IEmpresa>(url, data);
  }

  async delete(id: string): Promise<IEmpresa> {
    const url = `${API_DATOS}/empresas/${id}`;
    return await this.axios.DELETE<IEmpresa>(url);
  }
}
