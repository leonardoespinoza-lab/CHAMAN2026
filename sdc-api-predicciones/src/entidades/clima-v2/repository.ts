import { Injectable } from '@nestjs/common';
import { API_CLIMA } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import {
  IClimaEstacionMeteorologica,
  IPronosticoEstacionMeteorologica,
  Sensores,
} from 'modelos/src';

export interface IQueryClima {
  lat: number;
  lng: number;
  fechaDesde: string;
  fechaHasta: string;
  agrupacion: 'hourly' | 'daily';
  sensores?: Sensores[];
  distancia?: number;
}

@Injectable()
export class ClimaV2Repository {
  constructor(private axios: AxiosService) {}

  async getClima(query: IQueryClima): Promise<IClimaEstacionMeteorologica[]> {
    // Usa query params
    const {
      lat,
      lng,
      fechaDesde,
      fechaHasta,
      agrupacion,
      sensores,
      distancia,
    } = query;
    const params: Record<string, any> = {
      lat,
      lng,
      fechaDesde,
      fechaHasta,
      agrupacion,
      sensores: sensores ? sensores.join(',') : undefined,
      distancia,
    };

    const url = `${API_CLIMA}/climav2/historico`;
    return await this.axios.GET<IClimaEstacionMeteorologica[]>(url, {
      params,
    });
  }

  async getSuelo(
    id: string,
    desde: string,
    hasta: string,
    agrupacion: 'hourly' | 'daily' = 'daily',
  ): Promise<IClimaEstacionMeteorologica[]> {
    const url = `${API_CLIMA}/climav2/suelo/${id}/${desde}/${hasta}`;
    return await this.axios.GET<IClimaEstacionMeteorologica[]>(url, {
      params: { agrupacion },
    });
  }

  async getPronostico(
    lat: number,
    lng: number,
    dias: number = 7,
  ): Promise<IPronosticoEstacionMeteorologica[]> {
    const url = `${API_CLIMA}/climav2/pronostico/${lat}/${lng}/${dias}`;
    return await this.axios.GET<IPronosticoEstacionMeteorologica[]>(url, {});
  }
}
