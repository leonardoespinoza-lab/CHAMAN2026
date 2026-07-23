import { Injectable } from '@nestjs/common';
import {
  ICreateVisitaLote,
  IFoto,
  IListado,
  IQueryParam,
  IUpdateVisitaLote,
  IVisitaLote,
} from 'modelos/src';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { API_DATOS } from '../../env';

@Injectable()
export class VisitasLoteRepository {
  constructor(private axios: AxiosService) {}

  async get(query: IQueryParam): Promise<IListado<IVisitaLote>> {
    return await this.axios.GET(`${API_DATOS}/visitas-lote`, { params: query });
  }

  async getById(id: string): Promise<IVisitaLote> {
    return await this.axios.GET(`${API_DATOS}/visitas-lote/${id}`);
  }

  async getFotosByIds(ids: string[]): Promise<IListado<IFoto>> {
    return await this.axios.GET(`${API_DATOS}/fotos`, {
      params: {
        filter: JSON.stringify({
          _id: { $in: ids },
          archivado: { $ne: true },
        }),
        limit: 0,
      },
    });
  }

  async create(data: ICreateVisitaLote): Promise<IVisitaLote> {
    return await this.axios.POST(`${API_DATOS}/visitas-lote`, data);
  }

  async update(id: string, data: IUpdateVisitaLote): Promise<IVisitaLote> {
    return await this.axios.PUT(`${API_DATOS}/visitas-lote/${id}`, data);
  }
}
