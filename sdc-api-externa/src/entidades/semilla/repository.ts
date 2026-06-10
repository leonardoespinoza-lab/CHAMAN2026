import { Injectable } from '@nestjs/common';
import { ISemilla, IListado, IQueryParam } from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class SemillasRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<ISemilla> {
    const url = `${API_DATOS}/semillas/${id}`;
    return await this.axios.GET<ISemilla>(url);
  }

  async get(params: IQueryParam): Promise<IListado<ISemilla>> {
    const url = `${API_DATOS}/semillas`;
    return await this.axios.GET<IListado<ISemilla>>(url, { params });
  }
}
