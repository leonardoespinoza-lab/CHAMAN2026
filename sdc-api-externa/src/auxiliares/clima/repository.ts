import { Injectable } from '@nestjs/common';
import { API_CLIMA } from '../../env';
import { AxiosService } from '../axios/axios.service';

export interface IValores {
  avg?: number;
  min?: number;
  max?: number;
  sum?: number;
  count?: number;
}

export interface IClimaEstacionMeteorologica {
  fuente?: 'Horatech' | 'FieldClimate';
  fecha?: string;
  estacion?: string;
  distancia?: number;
  temperatura?: IValores;
  humedad?: IValores;
  presion?: IValores;
  velocidadViento?: IValores;
  direccionViento?: IValores;
  intensidadLuminica?: IValores;
  lluvia?: IValores;
}

@Injectable()
export class ClimaRepository {
  constructor(private axios: AxiosService) {}

  async getClimaEntreFechas(
    lat: number,
    lng: number,
    from: string,
    to: string,
  ): Promise<IClimaEstacionMeteorologica> {
    const url = `${API_CLIMA}/clima/estacion/cerca/${lat}/${lng}/${from}/${to}`;
    return await this.axios.GET<IClimaEstacionMeteorologica>(url);
  }

  async getPluviometro(
    lat: number,
    lng: number,
  ): Promise<IClimaEstacionMeteorologica> {
    const url = `${API_CLIMA}/clima/pluviometro/cerca/${lat}/${lng}`;
    return await this.axios.GET<IClimaEstacionMeteorologica>(url);
  }

  async getClima(
    lat: number,
    lng: number,
  ): Promise<IClimaEstacionMeteorologica> {
    const url = `${API_CLIMA}/clima/estacion/cerca/${lat}/${lng}`;
    return await this.axios.GET<IClimaEstacionMeteorologica>(url);
  }

  async getSondaSuelo(
    lat: number,
    lng: number,
  ): Promise<IClimaEstacionMeteorologica> {
    const url = `${API_CLIMA}/clima/suelo/cerca/${lat}/${lng}`;
    return await this.axios.GET<IClimaEstacionMeteorologica>(url);
  }
}
