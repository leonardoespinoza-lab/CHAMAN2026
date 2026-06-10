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

  async getClimaEntreFechas(
    lat: number,
    lng: number,
    from: string,
    to: string,
  ) {
    const url = `${API_CLIMA}/clima/estacion/cerca/${lat}/${lng}/${from}/${to}`;
    return await this.axios.GET<IClimaEstacionMeteorologica[]>(url);
  }

  async getClima(lat: number, lng: number) {
    const url = `${API_CLIMA}/clima/actual/cerca/${lat}/${lng}`;
    return await this.axios.GET<IClimaEstacionMeteorologica>(url);
  }

  async getClimaMeteoSource(lat: number, lng: number) {
    const url = `${API_CLIMA}/clima/meteoSource/current/${lat}/${lng}`;
    return await this.axios.GET<IClimaEstacionMeteorologica>(url);
  }

  async getSemaforo(lat: number, lng: number) {
    const url = `${API_CLIMA}/clima/semaforo/${lat}/${lng}`;
    return await this.axios.GET<SemaforoClima>(url);
  }

  async getPronostico(lat: number, lng: number) {
    const url = `${API_CLIMA}/clima/pronostico/cerca/${lat}/${lng}`;
    return await this.axios.GET<IPronosticoEstacionMeteorologica[]>(url);
  }
}

export enum SemaforoClima {
  Excelente = 1,
  Bueno = 2,
  Malo = 3,
}
