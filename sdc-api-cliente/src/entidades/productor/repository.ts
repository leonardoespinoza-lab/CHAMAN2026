import { Injectable } from '@nestjs/common';
import {
  IProductor,
  IListado,
  IQueryParam,
  ICreateProductor,
  IUpdateProductor,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class ProductorsRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IProductor> {
    const url = `${API_DATOS}/productors/${id}`;
    return await this.axios.GET<IProductor>(url);
  }

  async get(params: IQueryParam): Promise<IListado<IProductor>> {
    const url = `${API_DATOS}/productors`;
    return await this.axios.GET<IListado<IProductor>>(url, { params });
  }

  async create(data: ICreateProductor): Promise<IProductor> {
    const url = `${API_DATOS}/productors`;
    return await this.axios.POST<IProductor>(url, data);
  }

  async update(id: string, data: IUpdateProductor): Promise<IProductor> {
    const url = `${API_DATOS}/productors/${id}`;
    return await this.axios.PUT<IProductor>(url, data);
  }

  async delete(id: string): Promise<IProductor> {
    const url = `${API_DATOS}/productors/${id}`;
    return await this.axios.DELETE<IProductor>(url);
  }
}
