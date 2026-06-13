import { Injectable } from '@nestjs/common';
import {
  ICreateLorawanUplink,
  ILorawanUplink,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class LorawanUplinksRepository {
  constructor(private axios: AxiosService) {}

  async create(data: ICreateLorawanUplink): Promise<ILorawanUplink> {
    const url = `${API_DATOS}/lorawan/uplinks`;
    return await this.axios.POST<ILorawanUplink>(url, data);
  }

  async latest(params?: {
    devEUI?: string;
    applicationID?: string;
    gatewayID?: string;
    limit?: string | number;
  }): Promise<ILorawanUplink[]> {
    const url = `${API_DATOS}/lorawan/uplinks/latest`;
    return await this.axios.GET<ILorawanUplink[]>(url, { params });
  }
}
