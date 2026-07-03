import { Injectable } from '@nestjs/common';
import { AlgoritmosRepository } from './repository';

@Injectable()
export class AlgoritmosService {
  constructor(private repository: AlgoritmosRepository) {}

  async getCatalogo(): Promise<any[]> {
    return await this.repository.getCatalogo();
  }

  async getReadinessCatalogos(): Promise<any> {
    return await this.repository.getReadinessCatalogos();
  }

  async getParametrosHuellaHidrica(): Promise<any> {
    return await this.repository.getParametrosHuellaHidrica();
  }

  async simularHuellaHidrica(body: any): Promise<any> {
    return await this.repository.simularHuellaHidrica(body);
  }

  async simularEnfermedades(body: any): Promise<any> {
    return await this.repository.simularEnfermedades(body);
  }

  async simularRiego(body: any): Promise<any> {
    return await this.repository.simularRiego(body);
  }

  async simularMalezas(body: any): Promise<any> {
    return await this.repository.simularMalezas(body);
  }
}
