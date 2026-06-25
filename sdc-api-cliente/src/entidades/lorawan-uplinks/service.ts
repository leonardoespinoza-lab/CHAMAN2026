import { Injectable } from '@nestjs/common';
import { LorawanUplinksRepository } from './repository';

@Injectable()
export class LorawanUplinksService {
  constructor(private readonly repository: LorawanUplinksRepository) {}

  async latest(query: {
    devEUI?: string;
    applicationID?: string;
    gatewayID?: string;
    limit?: string | number;
  }) {
    return await this.repository.latest({
      devEUI: query.devEUI,
      applicationID: query.applicationID,
      gatewayID: query.gatewayID,
      limit: Math.min(Number(query.limit) || 100, 300),
    });
  }

  async reprocess(query: { devEUI?: string; limit?: string | number }) {
    return await this.repository.reprocess({
      devEUI: query.devEUI,
      limit: Math.min(Number(query.limit) || 10000, 20000),
    });
  }
}
