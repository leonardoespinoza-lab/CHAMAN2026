import { Injectable } from '@nestjs/common';
import { ITokenPush, IListado, IQueryParam, IFilter } from 'modelos/src';
import { TokenPushsRepository } from './repository';

@Injectable()
export class TokenPushsService {
  constructor(private repository: TokenPushsRepository) {}

  private async getById(id: string): Promise<ITokenPush> {
    return await this.repository.getById(id);
  }

  private async get(filtro: IQueryParam): Promise<IListado<ITokenPush>> {
    return await this.repository.get(filtro);
  }

  async getPorIdsUsuarios(idUsuarios: string[]): Promise<ITokenPush[]> {
    const filter: IFilter<ITokenPush> = { idUsuario: { $in: idUsuarios } };
    const query: IQueryParam = { filter: JSON.stringify(filter), limit: 0 };

    const { datos } = await this.get(query);
    return datos;
  }
}
