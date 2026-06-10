import { Injectable } from '@nestjs/common';
import { IClient, ICreateClient } from 'modelos/src';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { API_DATOS } from '../../env';

@Injectable()
export class ClientsRepository {
  constructor(private axios: AxiosService) {}

  async getClient(clientId: string, clientSecret: string): Promise<IClient> {
    const url = `${API_DATOS}/oauth/client/${clientId}/${clientSecret}`;
    return await this.axios.GET<IClient>(url);
  }

  async createClient(datos: ICreateClient): Promise<IClient> {
    const url = `${API_DATOS}/oauth/client`;
    return await this.axios.POST<IClient>(url, datos);
  }
}
