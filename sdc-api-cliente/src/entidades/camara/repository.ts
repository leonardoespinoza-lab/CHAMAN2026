import { Injectable } from '@nestjs/common';
import {
  ICreateFoto,
  ICreateCamara,
  IFoto,
  ICamara,
  ILote,
  IListado,
  IQueryParam,
  IUpdateCamara,
  IUpdateLote,
} from 'modelos/src';
import { API_DATOS, API_FTP, TIMELAPSE_ADMIN_TOKEN } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

interface HikConnectCameraResponse {
  total?: number;
  cameras?: Record<string, unknown>[];
}

@Injectable()
export class CamarasRepository {
  constructor(private axios: AxiosService) {}

  async getCamaras(params: IQueryParam): Promise<IListado<ICamara>> {
    const url = `${API_DATOS}/camaras`;
    return await this.axios.GET<IListado<ICamara>>(url, { params });
  }

  async upsertCamaras(camaras: ICreateCamara[]): Promise<IListado<ICamara>> {
    const url = `${API_DATOS}/camaras/bulk-upsert`;
    return await this.axios.POST<IListado<ICamara>>(url, { camaras });
  }

  async updateCamara(
    serialCamara: string,
    data: IUpdateCamara,
  ): Promise<ICamara> {
    const url = `${API_DATOS}/camaras/${encodeURIComponent(serialCamara)}`;
    return await this.axios.PUT<ICamara>(url, data);
  }

  async getHikConnectCameras(): Promise<HikConnectCameraResponse> {
    const url = `${API_FTP}/hik-connect/cameras`;
    return await this.axios.GET<HikConnectCameraResponse>(url, {
      headers: this.adminHeaders(),
      timeout: 20000,
    });
  }

  async capturarHikConnect(
    serialCamara: string,
    canal = 1,
  ): Promise<ICreateFoto> {
    const url = `${API_FTP}/hik-connect/capture/${encodeURIComponent(serialCamara)}`;
    return await this.axios.POST<ICreateFoto>(
      url,
      {},
      {
        headers: this.adminHeaders(),
        params: { channelNo: canal },
        timeout: 45000,
      },
    );
  }

  async getLotes(params: IQueryParam): Promise<IListado<ILote>> {
    const url = `${API_DATOS}/lotes`;
    return await this.axios.GET<IListado<ILote>>(url, { params });
  }

  async updateLote(id: string, data: IUpdateLote): Promise<ILote> {
    const url = `${API_DATOS}/lotes/${id}`;
    return await this.axios.PUT<ILote>(url, data);
  }

  async getFotos(params: IQueryParam): Promise<IListado<IFoto>> {
    const url = `${API_DATOS}/fotos`;
    return await this.axios.GET<IListado<IFoto>>(url, { params });
  }

  private adminHeaders(): Record<string, string> {
    if (!TIMELAPSE_ADMIN_TOKEN) {
      return {};
    }
    return {
      Authorization: `Bearer ${TIMELAPSE_ADMIN_TOKEN}`,
      'x-timelapse-token': TIMELAPSE_ADMIN_TOKEN,
    };
  }
}
