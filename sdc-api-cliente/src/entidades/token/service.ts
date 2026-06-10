import { Injectable } from '@nestjs/common';
import { IToken } from 'modelos/src';
import { TokensRepository } from './repository';

@Injectable()
export class TokensService {
  constructor(private repository: TokensRepository) {}

  async getByAccessToken(ac: string): Promise<IToken> {
    return await this.repository.getByAccessToken(ac);
  }
}
