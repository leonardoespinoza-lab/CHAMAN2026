import { Injectable } from '@nestjs/common';
import { IQuimica } from 'modelos/src';
import { QuimicasRepository } from './repository';

@Injectable()
export class QuimicasService {
  constructor(private repository: QuimicasRepository) {}

  async getById(id: string): Promise<IQuimica> {
    return await this.repository.getById(id);
  }
}
