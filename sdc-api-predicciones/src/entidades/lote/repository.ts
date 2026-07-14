import { Injectable } from '@nestjs/common';
import {
  ILote,
  IListado,
  IQueryParam,
  ICreateLote,
  IUpdateLote,
  IEntradasAgronomicasSuelo,
} from 'modelos/src';
import { API_DATOS, SOIL_INTELLIGENCE_INTERNAL_TOKEN } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class LotesRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<ILote> {
    const url = `${API_DATOS}/lotes/${id}`;
    return await this.axios.GET<ILote>(url);
  }

  async getSoilAgronomicInputs(
    id: string,
  ): Promise<IEntradasAgronomicasSuelo | null> {
    const url = `${API_DATOS}/soil-intelligence/lots/${id}/agronomic-inputs`;
    return this.axios.GET<IEntradasAgronomicasSuelo | null>(url, {
      headers: SOIL_INTELLIGENCE_INTERNAL_TOKEN
        ? { 'x-chaman-internal-token': SOIL_INTELLIGENCE_INTERNAL_TOKEN }
        : {},
    });
  }

  async get(params: IQueryParam): Promise<IListado<ILote>> {
    const url = `${API_DATOS}/lotes`;
    return await this.axios.GET<IListado<ILote>>(url, { params });
  }

  async create(data: ICreateLote): Promise<ILote> {
    const url = `${API_DATOS}/lotes`;
    return await this.axios.POST<ILote>(url, data);
  }

  async update(id: string, data: IUpdateLote): Promise<ILote> {
    const url = `${API_DATOS}/lotes/${id}`;
    return await this.axios.PUT<ILote>(url, data);
  }

  async delete(id: string): Promise<ILote> {
    const url = `${API_DATOS}/lotes/${id}`;
    return await this.axios.DELETE<ILote>(url);
  }
}
