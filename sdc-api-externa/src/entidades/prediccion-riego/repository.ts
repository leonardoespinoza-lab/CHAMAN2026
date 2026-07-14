import { Injectable } from '@nestjs/common';
import {
  IPrediccionRiego,
  ICreatePrediccionRiego,
  IListado,
  IQueryParam,
  IUpdatePrediccionRiego,
  IEntradasAgronomicasSuelo,
} from 'modelos/src';
import { API_DATOS, SOIL_INTELLIGENCE_INTERNAL_TOKEN } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class PrediccionRiegoRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IPrediccionRiego> {
    const url = `${API_DATOS}/prediccion-riego/${id}`;
    return await this.axios.GET<IPrediccionRiego>(url);
  }

  async get(filtro: IQueryParam): Promise<IListado<IPrediccionRiego>> {
    const url = `${API_DATOS}/prediccion-riego`;
    return await this.axios.GET<IListado<IPrediccionRiego>>(url, {
      params: filtro,
    });
  }

  async getAgronomicInputsByLot(
    idLote: string,
  ): Promise<IEntradasAgronomicasSuelo | null> {
    const encodedLotId = encodeURIComponent(idLote);
    const url = `${API_DATOS}/soil-intelligence/lots/${encodedLotId}/agronomic-inputs`;
    return await this.axios.GET<IEntradasAgronomicasSuelo | null>(url, {
      headers: SOIL_INTELLIGENCE_INTERNAL_TOKEN
        ? { 'x-chaman-internal-token': SOIL_INTELLIGENCE_INTERNAL_TOKEN }
        : {},
    });
  }

  async create(data: ICreatePrediccionRiego): Promise<IPrediccionRiego> {
    const url = `${API_DATOS}/prediccion-riego`;
    return await this.axios.POST<IPrediccionRiego>(url, data);
  }

  async update(
    id: string,
    data: IUpdatePrediccionRiego,
  ): Promise<IPrediccionRiego> {
    const url = `${API_DATOS}/prediccion-riego/${id}`;
    return await this.axios.PUT<IPrediccionRiego>(url, data);
  }

  async delete(id: string): Promise<IPrediccionRiego> {
    const url = `${API_DATOS}/prediccion-riego/${id}`;
    return await this.axios.DELETE<IPrediccionRiego>(url);
  }
}
