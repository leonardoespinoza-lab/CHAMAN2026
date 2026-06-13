import { Injectable } from '@nestjs/common';
import { AlgoritmosRepository } from './repository';

@Injectable()
export class AlgoritmosService {
  constructor(private repository: AlgoritmosRepository) {}

  async getCatalogo(): Promise<any[]> {
    return await this.repository.getCatalogo();
  }

  async getParametrosHuellaHidrica(): Promise<any> {
    return await this.repository.getParametrosHuellaHidrica();
  }

  async simularHuellaHidrica(body: any): Promise<any> {
    return await this.repository.simularHuellaHidrica(body);
  }
}
