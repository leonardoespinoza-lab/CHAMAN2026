import { Injectable } from '@nestjs/common';
import { API_CLIMA } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import {
  IClimaEstacionMeteorologica,
  IPronosticoEstacionMeteorologica,
} from 'modelos/src';

@Injectable()
export class ClimaRepository {
  constructor(private axios: AxiosService) {}

  async getEstacionMasCercanaEntreFechas(
    lat: number,
    lng: number,
    from: string,
    to: string,
    dataGroup?: 'raw' | 'hourly' | 'daily' | 'monthly',
    idEstacionMeteorologica?: string,
  ): Promise<IClimaEstacionMeteorologica[]> {
    const url = `${API_CLIMA}/clima/estacion/cerca/${lat}/${lng}/${from}/${to}`;
    const params = {
      dataGroup,
      idEstacionMeteorologica,
      soloEstacionAsociada: true,
    };
    return await this.axios.GET<IClimaEstacionMeteorologica[]>(url, { params });
  }

  async getPluviometroMasCercanaEntreFechas(
    lat: number,
    lng: number,
    from: string,
    to: string,
    dataGroup?: 'raw' | 'hourly' | 'daily' | 'monthly',
  ): Promise<IClimaEstacionMeteorologica[]> {
    const url = `${API_CLIMA}/clima/pluviometro/cerca/${lat}/${lng}/${from}/${to}`;
    const params = dataGroup ? { dataGroup } : {};
    return await this.axios.GET<IClimaEstacionMeteorologica[]>(url, { params });
  }

  async getSueloMasCercanaEntreFechas(
    lat: number,
    lng: number,
    from: string,
    to: string,
  ): Promise<IClimaEstacionMeteorologica[]> {
    const url = `${API_CLIMA}/clima/suelo/cerca/${lat}/${lng}/${from}/${to}`;
    return await this.axios.GET<IClimaEstacionMeteorologica[]>(url, {});
  }

  async getClimaMasCercanaEntreFechas(
    lat: number,
    lng: number,
    from: string,
    to: string,
  ): Promise<{
    estacion: IClimaEstacionMeteorologica[];
    pluviometro: IClimaEstacionMeteorologica[];
    suelo: IClimaEstacionMeteorologica[];
  }> {
    const url = `${API_CLIMA}/clima/clima/cerca/${lat}/${lng}/${from}/${to}`;
    return await this.axios.GET<{
      estacion: IClimaEstacionMeteorologica[];
      pluviometro: IClimaEstacionMeteorologica[];
      suelo: IClimaEstacionMeteorologica[];
    }>(url, {});
  }

  async getPronosticoMasCercano(
    lat: number,
    lng: number,
  ): Promise<IPronosticoEstacionMeteorologica[]> {
    const url = `${API_CLIMA}/clima/pronostico/cerca/${lat}/${lng}`;
    return await this.axios.GET<IPronosticoEstacionMeteorologica[]>(url, {});
  }

  async getSueloPorDispositivoEntreFechas(
    id: string,
    from: string,
    to: string,
  ) {
    const url = `${API_CLIMA}/clima/suelo/dispositivo/${id}/${from}/${to}`;
    return await this.axios.GET<IClimaEstacionMeteorologica[]>(url, {});
  }

  async getSueloPorDispositivo(id: string) {
    const url = `${API_CLIMA}/clima/suelo/dispositivo/${id}`;
    return await this.axios.GET<IClimaEstacionMeteorologica[]>(url, {});
  }
}
