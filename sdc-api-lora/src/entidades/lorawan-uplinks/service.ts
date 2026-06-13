import { Injectable } from '@nestjs/common';
import {
  ICreateLorawanUplink,
  ILorawanUplink,
} from 'modelos/src';
import { LorawanUplinksRepository } from './repository';

@Injectable()
export class LorawanUplinksService {
  constructor(private readonly repository: LorawanUplinksRepository) {}

  async create(data: ICreateLorawanUplink): Promise<ILorawanUplink> {
    return await this.repository.create(data);
  }

  async latest(query: {
    devEUI?: string;
    applicationID?: string;
    gatewayID?: string;
    limit?: string | number;
  }): Promise<ILorawanUplink[]> {
    return await this.repository.latest(query);
  }
}
