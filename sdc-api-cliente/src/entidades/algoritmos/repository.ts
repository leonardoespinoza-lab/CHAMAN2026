import { Injectable } from '@nestjs/common';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { API_DATOS } from '../../env';

@Injectable()
export class AlgoritmosRepository {
  constructor(private axios: AxiosService) {}

  async getCatalogo(): Promise<any[]> {
    return await this.axios.GET<any[]>(`${API_DATOS}/algoritmos`);
  }

  async getParametrosHuellaHidrica(): Promise<any> {
    return await this.axios.GET<any>(`${API_DATOS}/algoritmos/huella-hidrica/parametros`);
  }

  async simularHuellaHidrica(body: any): Promise<any> {
    return await this.axios.POST<any>(`${API_DATOS}/algoritmos/huella-hidrica/simular`, body);
  }
}
