import { Injectable } from '@nestjs/common';
import {
  IUsuario,
  IListado,
  IQueryParam,
  ICreateUsuario,
  IUpdateUsuario,
} from 'modelos/src';
import { API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class UsuariosRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IUsuario> {
    const url = `${API_DATOS}/usuarios/${id}`;
    return await this.axios.GET<IUsuario>(url);
  }

  async getByUsername(username: string): Promise<IUsuario> {
    const url = `${API_DATOS}/usuarios/usuario/login/${username}`;
    return await this.axios.GET<IUsuario>(url);
  }

  async getByEmail(email: string): Promise<IUsuario> {
    const url = `${API_DATOS}/usuarios/email/${email}`;
    return await this.axios.GET<IUsuario>(url);
  }

  async get(filtro: IQueryParam): Promise<IListado<IUsuario>> {
    const url = `${API_DATOS}/usuarios`;
    return await this.axios.GET<IListado<IUsuario>>(url, { params: filtro });
  }

  async create(data: ICreateUsuario): Promise<IUsuario> {
    const url = `${API_DATOS}/usuarios`;
    return await this.axios.POST<IUsuario>(url, data);
  }

  async update(id: string, data: IUpdateUsuario): Promise<IUsuario> {
    const url = `${API_DATOS}/usuarios/${id}`;
    return await this.axios.PUT<IUsuario>(url, data);
  }

  async delete(id: string): Promise<IUsuario> {
    const url = `${API_DATOS}/usuarios/${id}`;
    return await this.axios.DELETE<IUsuario>(url);
  }
}
