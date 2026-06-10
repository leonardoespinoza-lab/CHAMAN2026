import { Injectable } from '@nestjs/common';
import { IUsuario, IListado, IQueryParam, IFilter } from 'modelos/src';
import { UsuariosRepository } from './repository';

@Injectable()
export class UsuariosService {
  constructor(private repository: UsuariosRepository) {}

  private async getById(id: string): Promise<IUsuario> {
    return await this.repository.getById(id);
  }

  private async get(filtro: IQueryParam): Promise<IListado<IUsuario>> {
    return await this.repository.get(filtro);
  }

  async getPorIdProductor(idProductor: string): Promise<IUsuario[]> {
    const filter: IFilter<IUsuario> = {
      'permisos.idProductor': idProductor,
    } as any;
    const query: IQueryParam = { filter: JSON.stringify(filter), limit: 0 };

    const { datos } = await this.get(query);
    return datos;
  }
}
