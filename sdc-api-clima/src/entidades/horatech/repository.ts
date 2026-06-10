import { Injectable } from '@nestjs/common';
import { API_HORATECH, API_HORATECH_APIKEY } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { IDispositivoHoratech, IReporteHoratech } from './modelos';
import { IListado } from 'modelos/src';

export interface Token {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
  expires_at: number;
}

@Injectable()
export class HoratechRepository {
  constructor(private axios: AxiosService) {}

  async getDispositivos() {
    const url = `/dispositivosClima`;
    return await this.axios.GET<IListado<IDispositivoHoratech>>(
      `${API_HORATECH}${url}`,
      {
        headers: {
          apikey: API_HORATECH_APIKEY,
        },
      },
    );
  }

  async getReportes(deveui: string, desde: string, hasta: string) {
    const url = `/reportesDispositivo/${deveui}?fechaDesde=${desde}&fechaHasta=${hasta}`;
    return await this.axios.GET<IListado<IReporteHoratech>>(
      `${API_HORATECH}${url}`,
      {
        headers: {
          apikey: API_HORATECH_APIKEY,
        },
      },
    );
  }

  async checkApi() {
    const url = `https://apis.horatech.com.ar/agro-v2-cliente-test/api`;
    return await this.axios.GET<void>(url);
  }
}
