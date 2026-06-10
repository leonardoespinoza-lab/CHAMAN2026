import { Injectable } from '@nestjs/common';
import { ClimaRepository } from './repository';

@Injectable()
export class ClimaService {
  constructor(private repository: ClimaRepository) {}

  async getClimaEntreFechas(
    lat: number,
    lng: number,
    from: string,
    to: string,
  ) {
    return await this.repository.getClimaEntreFechas(lat, lng, from, to);
  }

  async getClima(lat: number, lng: number) {
    return await this.repository.getClima(lat, lng);
  }

  async getPluviometro(lat: number, lng: number) {
    return await this.repository.getPluviometro(lat, lng);
  }

  async getSondaSuelo(lat: number, lng: number) {
    return await this.repository.getSondaSuelo(lat, lng);
  }
}
