import { Injectable } from '@nestjs/common';
import {
  ILote,
  IListado,
  IQueryParam,
  ICreateLote,
  IUpdateLote,
  ISueloInta,
  IInteligenciaSueloLote,
  IEntradasAgronomicasSuelo,
} from 'modelos/src';
import {
  AGROMETEO_INTERNAL_TOKEN,
  LOT_LOCATION_INTERNAL_TOKEN,
  API_CLIMA,
  API_DATOS,
  API_PREDICCIONES,
} from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class LotesRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<ILote> {
    const url = `${API_DATOS}/lotes/${id}`;
    return await this.axios.GET<ILote>(url);
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

  async calcularCapacidadCampo(idSonda: string, fecha: string) {
    const url = `${API_PREDICCIONES}/riego/capacidad-campo/${idSonda}/${fecha}`;
    return await this.axios.GET(url);
  }

  async getSueloIntaLocal(
    lat: number,
    lng: number,
  ): Promise<ISueloInta | null> {
    const url = `${API_DATOS}/suelos-inta/punto`;
    return await this.axios.GET<ISueloInta | null>(url, {
      params: { lat, lng },
    });
  }

  async reprocesarAgrometeorologia(idSiembra: string): Promise<void> {
    const url = `${API_CLIMA}/agrometeorologia/siembras/${idSiembra}/reprocesar`;
    await this.axios.POST<void>(
      url,
      { sincronizarClima: true },
      {
        headers: AGROMETEO_INTERNAL_TOKEN
          ? { 'x-chaman-internal-token': AGROMETEO_INTERNAL_TOKEN }
          : {},
      },
    );
  }

  async getAdministrativeLocation(idLote: string) {
    const url = `${API_DATOS}/lot-locations/lotes/${idLote}`;
    return await this.axios.GET(url, {
      headers: LOT_LOCATION_INTERNAL_TOKEN
        ? { 'x-chaman-internal-token': LOT_LOCATION_INTERNAL_TOKEN }
        : {},
    });
  }

  async resolveAdministrativeLocation(idLote: string, force = false) {
    const url = `${API_DATOS}/lot-locations/lotes/${idLote}/resolve`;
    return await this.axios.POST(
      url,
      { motivo: 'manual_retry', force },
      {
        headers: LOT_LOCATION_INTERNAL_TOKEN
          ? { 'x-chaman-internal-token': LOT_LOCATION_INTERNAL_TOKEN }
          : {},
      },
    );
  }

  async getSoilIntelligence(
    idLote: string,
  ): Promise<IInteligenciaSueloLote | null> {
    const url = `${API_DATOS}/soil-intelligence/lots/${idLote}`;
    return await this.axios.GET<IInteligenciaSueloLote | null>(url, {
      headers: LOT_LOCATION_INTERNAL_TOKEN
        ? { 'x-chaman-internal-token': LOT_LOCATION_INTERNAL_TOKEN }
        : {},
    });
  }

  async getSoilAgronomicInputs(
    idLote: string,
  ): Promise<IEntradasAgronomicasSuelo | null> {
    const url = `${API_DATOS}/soil-intelligence/lots/${idLote}/agronomic-inputs`;
    return await this.axios.GET<IEntradasAgronomicasSuelo | null>(url, {
      headers: LOT_LOCATION_INTERNAL_TOKEN
        ? { 'x-chaman-internal-token': LOT_LOCATION_INTERNAL_TOKEN }
        : {},
    });
  }

  async reprocessSoilIntelligence(idLote: string) {
    const url = `${API_DATOS}/soil-intelligence/lots/${idLote}/reprocess`;
    return await this.axios.POST<IInteligenciaSueloLote>(
      url,
      { reason: 'manual_retry', force: true },
      {
        headers: LOT_LOCATION_INTERNAL_TOKEN
          ? { 'x-chaman-internal-token': LOT_LOCATION_INTERNAL_TOKEN }
          : {},
      },
    );
  }
}
