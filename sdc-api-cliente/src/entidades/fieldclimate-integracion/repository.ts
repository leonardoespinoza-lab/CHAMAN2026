import { Injectable } from '@nestjs/common';
import {
  ICreateEstacion,
  IEstablecimiento,
  IEstacion,
  IListado,
  IQueryParam,
  IUpdateEstablecimiento,
  IUpdateEstacion,
} from 'modelos/src';
import { AGROMETEO_INTERNAL_TOKEN, API_CLIMA, API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

export interface FieldClimateCredentials {
  username: string;
  password: string;
}

@Injectable()
export class FieldClimateIntegracionRepository {
  constructor(private axios: AxiosService) {}

  async descubrirCentrales(
    credentials: FieldClimateCredentials,
  ): Promise<any[]> {
    const url = `${API_CLIMA}/fieldclimate/integracion/stations`;
    return await this.axios.POST<any[]>(url, credentials);
  }

  async obtenerCentral(
    stationId: string,
    credentials: FieldClimateCredentials,
  ): Promise<any> {
    const id = encodeURIComponent(stationId);
    const url = `${API_CLIMA}/fieldclimate/integracion/stations/${id}`;
    return await this.axios.POST<any>(url, credentials);
  }

  async obtenerSensores(
    stationId: string,
    credentials: FieldClimateCredentials,
  ): Promise<any> {
    const id = encodeURIComponent(stationId);
    const url = `${API_CLIMA}/fieldclimate/integracion/stations/${id}/sensors`;
    return await this.axios.POST<any>(url, credentials);
  }

  async obtenerUltimosDatos(
    stationId: string,
    credentials: FieldClimateCredentials,
  ): Promise<any> {
    const id = encodeURIComponent(stationId);
    const url = `${API_CLIMA}/fieldclimate/integracion/stations/${id}/last`;
    return await this.axios.POST<any>(url, {
      ...credentials,
      dataGroup: 'hourly',
      timePeriod: '48h',
    });
  }

  async upsertCentral(data: ICreateEstacion): Promise<IEstacion> {
    const url = `${API_DATOS}/estacions/upsert`;
    return await this.axios.POST<IEstacion>(url, data);
  }

  async listarCentrales(params: IQueryParam): Promise<IListado<IEstacion>> {
    const url = `${API_DATOS}/estacions`;
    return await this.axios.GET<IListado<IEstacion>>(url, { params });
  }

  async obtenerCentralChaman(id: string): Promise<IEstacion> {
    const url = `${API_DATOS}/estacions/${id}`;
    return await this.axios.GET<IEstacion>(url);
  }

  async actualizarCentral(
    id: string,
    data: IUpdateEstacion,
  ): Promise<IEstacion> {
    const url = `${API_DATOS}/estacions/${id}`;
    return await this.axios.PUT<IEstacion>(url, data);
  }

  async actualizarEstablecimiento(
    id: string,
    data: IUpdateEstablecimiento,
  ): Promise<IEstablecimiento> {
    const url = `${API_DATOS}/establecimientos/${id}`;
    return await this.axios.PUT<IEstablecimiento>(url, data);
  }

  async listarEstablecimientos(
    params: IQueryParam,
  ): Promise<IListado<IEstablecimiento>> {
    const url = `${API_DATOS}/establecimientos`;
    return await this.axios.GET<IListado<IEstablecimiento>>(url, { params });
  }

  async reprocesarAgrometeorologia(idEstablecimiento: string): Promise<void> {
    const url = `${API_CLIMA}/agrometeorologia/establecimientos/${idEstablecimiento}/reprocesar`;
    await this.axios.POST<void>(
      url,
      {},
      {
        headers: AGROMETEO_INTERNAL_TOKEN
          ? { 'x-chaman-internal-token': AGROMETEO_INTERNAL_TOKEN }
          : {},
      },
    );
  }
}
