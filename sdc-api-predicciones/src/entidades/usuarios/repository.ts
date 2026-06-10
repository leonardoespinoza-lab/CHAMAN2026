import { Injectable } from '@nestjs/common';
import { IUsuario, IListado, IQueryParam } from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class UsuariosRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IUsuario> {
    const url = `${API_DATOS}/usuarios/${id}`;
    return await this.axios.GET<IUsuario>(url);
  }

  async get(params: IQueryParam): Promise<IListado<IUsuario>> {
    const url = `${API_DATOS}/usuarios`;
    return await this.axios.GET<IListado<IUsuario>>(url, { params });
  }
}
