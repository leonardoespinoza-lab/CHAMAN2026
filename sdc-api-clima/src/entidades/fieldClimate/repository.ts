import { Injectable } from '@nestjs/common';
import { API_FIELD_CLIMATE } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { HelperService } from '../../auxiliares/helper';
import { IStation } from './modelos/station';
import { IStationSensor } from './modelos/stationSensor';
import { IStationData } from './modelos/stationData';
import { LogService } from '../../auxiliares/logsService/service';
import { IForecast } from './modelos/forecast';

export interface Token {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
  expires_at: number;
}

@Injectable()
export class FieldClimateRepository {
  private logger = new LogService(FieldClimateRepository.name);
  private token: { [username: string]: Token } = {};

  constructor(private axios: AxiosService) {}

  // Login

  async login(username: string, password: string): Promise<Token> {
    try {
      const url = 'https://oauth.fieldclimate.com/token';

      const headers = {
        Origin: 'https://www.fieldclimate.com',
        Referer: 'https://www.fieldclimate.com/',
      };

      const body = {
        client_id: 'FieldclimateNG',
        client_secret: '618a5baf48287eecbdfc754e9c933a',
        grant_type: 'password',
        password,
        username,
      };

      const token = await this.axios.POST<Token>(url, body, { headers });
      token.expires_at = Date.now() + token.expires_in * 1000;
      this.token[username] = token;
      return token;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  private async validarToken(
    username: string,
    password: string,
  ): Promise<void> {
    if (!this.token[username]) {
      await this.login(username, password);
    } else {
      const now = new Date().getTime() + 1000 * 10;
      if (now > this.token[username].expires_at) {
        await this.login(username, password);
      }
    }
  }

  // Endpoints

  async systemStatus(username: string, password: string): Promise<boolean> {
    const url = '/system/status';
    await this.validarToken(username, password);
    const headers = HelperService.getFieldClimateHeadersLogin(
      this.token[username].access_token,
    );
    return await this.axios.GET(`${API_FIELD_CLIMATE}${url}`, { headers });
  }

  async getLicenses(username: string, password: string): Promise<any> {
    const url = '/user/licenses';
    await this.validarToken(username, password);
    const headers = HelperService.getFieldClimateHeadersLogin(
      this.token[username].access_token,
    );
    return await this.axios.GET(`${API_FIELD_CLIMATE}${url}`, { headers });
  }

  async getStations(username: string, password: string): Promise<IStation[]> {
    const url = '/user/stations';
    await this.validarToken(username, password);
    const headers = HelperService.getFieldClimateHeadersLogin(
      this.token[username].access_token,
    );
    const res = await this.axios.GET<IStation[]>(`${API_FIELD_CLIMATE}${url}`, {
      headers,
    });
    return res;
  }

  async getStation(
    id: string,
    username: string,
    password: string,
  ): Promise<IStation> {
    const url = `/station/${id}`;
    await this.validarToken(username, password);
    const headers = HelperService.getFieldClimateHeadersLogin(
      this.token[username].access_token,
    );
    return await this.axios.GET(`${API_FIELD_CLIMATE}${url}`, { headers });
  }

  async getSystemTypes(username: string, password: string): Promise<IStation> {
    const url = `/system/types`;
    await this.validarToken(username, password);
    const headers = HelperService.getFieldClimateHeadersLogin(
      this.token[username].access_token,
    );
    return await this.axios.GET(`${API_FIELD_CLIMATE}${url}`, { headers });
  }

  async getStationSensors(
    id: string,
    username: string,
    password: string,
  ): Promise<IStationSensor> {
    const url = `/station/${id}/sensors`;
    await this.validarToken(username, password);
    const headers = HelperService.getFieldClimateHeadersLogin(
      this.token[username].access_token,
    );
    return await this.axios.GET(`${API_FIELD_CLIMATE}${url}`, { headers });
  }

  async getMinMaxTimeData(
    stationId: string,
    username: string,
    password: string,
  ): Promise<any> {
    const url = `/data/${stationId}`;
    await this.validarToken(username, password);
    const headers = HelperService.getFieldClimateHeadersLogin(
      this.token[username].access_token,
    );
    return await this.axios.GET(`${API_FIELD_CLIMATE}${url}`, { headers });
  }

  async getDataBetweenDates(
    stationId: string,
    dataGroup: string,
    startDate: number,
    endDate: number,
    username: string,
    password: string,
  ): Promise<IStationData> {
    const fromUnixTime = Math.trunc(startDate / 1000);
    const toUnixTime = Math.trunc(endDate / 1000);
    const url = `/data/${stationId}/${dataGroup}/from/${fromUnixTime}/to/${toUnixTime}`;
    await this.validarToken(username, password);
    const headers = HelperService.getFieldClimateHeadersLogin(
      this.token[username].access_token,
    );
    return await this.axios.GET(`${API_FIELD_CLIMATE}${url}`, { headers });
  }

  async getLastData(
    stationId: string,
    dataGroup: string,
    timePeriod: string,
    username: string,
    password: string,
  ): Promise<IStationData> {
    const url = `/data/${stationId}/${dataGroup}/last/${timePeriod}`;
    await this.validarToken(username, password);
    const headers = HelperService.getFieldClimateHeadersLogin(
      this.token[username].access_token,
    );
    return await this.axios.GET(`${API_FIELD_CLIMATE}${url}`, { headers });
  }

  async getForecast(
    stationId: string,
    username: string,
    password: string,
  ): Promise<IForecast> {
    const url = `/forecast/${stationId}/daily`;
    await this.validarToken(username, password);
    const headers = HelperService.getFieldClimateHeadersLogin(
      this.token[username].access_token,
    );
    const body = {
      name: 'general7',
    };
    return await this.axios.POST(`${API_FIELD_CLIMATE}${url}`, body, {
      headers,
    });
  }
}
