import { Injectable } from '@nestjs/common';
import { API_OPEN_WEATHER, OPEN_WEATHER_KEY } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { IForecastOpenWeather } from './modelos/modelos';

export interface Token {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
  expires_at: number;
}

@Injectable()
export class OpenWeatherRepository {
  constructor(private axios: AxiosService) {}

  async getForecast(lat: number, lon: number): Promise<IForecastOpenWeather> {
    const url = `/forecast/daily?lat=${lat}&lon=${lon}&cnt=7&appid=${OPEN_WEATHER_KEY}&units=metric&lang=es`;
    return await this.axios.GET(`${API_OPEN_WEATHER}${url}`);
  }

  async checkApi() {
    const url = `http://api.openweathermap.org/data/2.5/forecast?id=524901&appid=${OPEN_WEATHER_KEY}`;
    return await this.axios.GET(url);
  }
}
