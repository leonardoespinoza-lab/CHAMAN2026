import { Injectable } from '@nestjs/common';
import { IClient, ICreateClient } from 'modelos/src';
import { ClientsRepository } from './client.repository';

@Injectable()
export class ClientsService {
  constructor(private repository: ClientsRepository) {}

  async getClient(id: string, secret: string): Promise<IClient> {
    return await this.repository.getClient(id, secret);
  }

  async createClient(client: ICreateClient): Promise<IClient> {
    return await this.repository.createClient(client);
  }
}
