import { Injectable } from '@nestjs/common';
import { IPrincipioActivo, IListado, IQueryParam } from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class PrincipioActivosRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IPrincipioActivo> {
    const url = `${API_DATOS}/principioactivos/${id}`;
    return await this.axios.GET<IPrincipioActivo>(url);
  }

  async get(filtro: IQueryParam): Promise<IListado<IPrincipioActivo>> {
    const url = `${API_DATOS}/principioactivos`;
    return await this.axios.GET<IListado<IPrincipioActivo>>(url, {
      params: filtro,
    });
  }
}
