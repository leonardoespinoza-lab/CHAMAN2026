import { Injectable } from '@nestjs/common';
import { IFertilizante, IListado, IQueryParam } from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class FertilizantesRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IFertilizante> {
    const url = `${API_DATOS}/fertilizantes/${id}`;
    return await this.axios.GET<IFertilizante>(url);
  }

  async get(filtro: IQueryParam): Promise<IListado<IFertilizante>> {
    const url = `${API_DATOS}/fertilizantes`;
    return await this.axios.GET<IListado<IFertilizante>>(url, {
      params: filtro,
    });
  }
}
