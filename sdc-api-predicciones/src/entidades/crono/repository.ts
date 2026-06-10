import { Injectable } from '@nestjs/common';
import { ICrono, IListado, IQueryParam } from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class CronosRepository {
  constructor(private axios: AxiosService) {}

  async get(params: IQueryParam): Promise<IListado<ICrono>> {
    const url = `${API_DATOS}/cronos`;
    return await this.axios.GET<IListado<ICrono>>(url, { params });
  }
}
