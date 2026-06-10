import { Injectable } from '@nestjs/common';
import { HoratechRepository } from './repository';

@Injectable()
export class HoratechService {
  constructor(private repository: HoratechRepository) {}

  async getDispositivos() {
    return await this.repository.getDispositivos();
  }

  async getReportes(deveui: string, desde: string, hasta: string) {
    return await this.repository.getReportes(deveui, desde, hasta);
  }

  async checkApi() {
    return await this.repository.checkApi();
  }
}
