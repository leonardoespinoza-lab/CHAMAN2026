import { Injectable } from '@nestjs/common';
import { IDepartamento, IListado, IQueryParam } from 'modelos/src';
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
}
