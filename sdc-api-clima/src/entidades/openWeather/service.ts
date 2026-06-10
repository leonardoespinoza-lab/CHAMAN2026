import { Injectable } from '@nestjs/common';
import { OpenWeatherRepository } from './repository';

@Injectable()
export class OpenWeatherService {
  constructor(private repository: OpenWeatherRepository) {}

  async getForecast(lat: number, lng: number) {
    return await this.repository.getForecast(lat, lng);
  }

  async checkApi() {
    return await this.repository.checkApi();
  }
}
