import { Injectable } from '@nestjs/common';
import { ITokenPush, ICreateTokenPush } from 'modelos/src';
import { TokenPushsRepository } from './repository';

@Injectable()
export class TokenPushsService {
  constructor(private repository: TokenPushsRepository) {}

  async upsert(datos: ICreateTokenPush): Promise<ITokenPush> {
    return await this.repository.upsert(datos);
  }
}
