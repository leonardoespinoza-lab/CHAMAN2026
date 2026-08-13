import { Injectable } from '@nestjs/common';
import { ILorawanUplink } from 'modelos/src';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { API_DATOS } from '../../env';

@Injectable()
export class LorawanUplinksRepository {
  constructor(private axios: AxiosService) {}

  async latest(params?: {
    devEUI?: string;
    applicationID?: string;
    gatewayID?: string;
    limit?: string | number;
  }): Promise<ILorawanUplink[]> {
    const url = `${API_DATOS}/lorawan/uplinks/latest`;
    return await this.axios.GET<ILorawanUplink[]>(url, { params });
  }

  async latestByDevice(limit?: string | number): Promise<ILorawanUplink[]> {
    const url = `${API_DATOS}/lorawan/uplinks/latest-devices`;
    return await this.axios.GET<ILorawanUplink[]>(url, {
      params: { limit },
    });
  }

  async reprocess(params: {
    devEUI?: string;
    limit?: string | number;
    replace?: string | boolean;
  }): Promise<any> {
    const url = `${API_DATOS}/lorawan/uplinks/reprocess`;
    return await this.axios.POST<any>(url, {}, { params });
  }
}
