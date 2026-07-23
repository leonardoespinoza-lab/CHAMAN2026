import { Injectable } from '@nestjs/common';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { API_DATOS } from '../../env';

@Injectable()
export class AlgoritmosRepository {
  constructor(private axios: AxiosService) {}

  async getCatalogo(): Promise<any[]> {
    return await this.axios.GET<any[]>(`${API_DATOS}/algoritmos`);
  }

  async getReadinessCatalogos(): Promise<any> {
    return await this.axios.GET<any>(
      `${API_DATOS}/algoritmos/catalogos/readiness`,
    );
  }

  async getParametrosHuellaHidrica(): Promise<any> {
    return await this.axios.GET<any>(
      `${API_DATOS}/algoritmos/huella-hidrica/parametros`,
    );
  }

  async simularHuellaHidrica(body: any): Promise<any> {
    return await this.axios.POST<any>(
      `${API_DATOS}/algoritmos/huella-hidrica/simular`,
      body,
    );
  }

  async simularEnfermedades(body: any): Promise<any> {
    return await this.axios.POST<any>(
      `${API_DATOS}/algoritmos/enfermedades/simular`,
      body,
    );
  }

  async simularRiego(body: any): Promise<any> {
    return await this.axios.POST<any>(
      `${API_DATOS}/algoritmos/riego/simular`,
      body,
    );
  }

  async simularMalezas(body: any): Promise<any> {
    return await this.axios.POST<any>(
      `${API_DATOS}/algoritmos/malezas/simular`,
      body,
    );
  }
}
