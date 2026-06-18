import { Injectable } from '@nestjs/common';
import { IFoto, ILote, IListado, IQueryParam } from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class FotosRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IFoto> {
    const url = `${API_DATOS}/fotos/${id}`;
    return await this.axios.GET<IFoto>(url);
  }

  async get(filtro: IQueryParam): Promise<IListado<IFoto>> {
    const url = `${API_DATOS}/fotos`;
    return await this.axios.GET<IListado<IFoto>>(url, {
      params: filtro,
    });
  }

  async getLoteById(id: string): Promise<ILote> {
    const url = `${API_DATOS}/lotes/${id}`;
    return await this.axios.GET<ILote>(url);
  }

  async getImagen(url: string): Promise<any> {
    return await this.axios.GET(url, { responseType: 'arraybuffer' });
  }

  async delete(id: string): Promise<IFoto> {
    const url = `${API_DATOS}/fotos/${id}`;
    return await this.axios.DELETE<IFoto>(url);
  }
}
