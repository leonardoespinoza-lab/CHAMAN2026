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
import { API_CLIMA, API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

export interface FieldClimateCredentials {
  username: string;
  password: string;
}

@Injectable()
export class FieldClimateIntegracionRepository {
  constructor(private axios: AxiosService) {}

  async descubrirCentrales(credentials: FieldClimateCredentials): Promise<any[]> {
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

  async upsertCentral(data: ICreateEstacion): Promise<IEstacion> {
    const url = `${API_DATOS}/estacions/upsert`;
    return await this.axios.POST<IEstacion>(url, data);
  }

  async listarCentrales(params: IQueryParam): Promise<IListado<IEstacion>> {
    const url = `${API_DATOS}/estacions`;
    return await this.axios.GET<IListado<IEstacion>>(url, { params });
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
}
