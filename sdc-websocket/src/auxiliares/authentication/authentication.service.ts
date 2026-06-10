import { Injectable } from '@nestjs/common';
import { IToken } from 'modelos/src';
import { AuthenticationRepository } from './authentication.repository';

@Injectable()
export class AuthenticationService {
  constructor(private repository: AuthenticationRepository) {}

  async authorization(authorization: string): Promise<IToken> {
    return await this.repository.authorization(authorization);
  }
}
