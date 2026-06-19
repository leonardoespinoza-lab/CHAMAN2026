import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ICreateCamara, IQueryParam, IUpdateCamara } from 'modelos/src';
import { CamarasRepository } from './repository';

@Injectable()
export class CamarasService {
  constructor(private repository: CamarasRepository) {}

  async getFilter(query: IQueryParam) {
    return await this.repository.getFilter(query);
  }

  async getBySerial(serialCamara: string) {
    const data = await this.repository.getBySerial(serialCamara);
    if (data) {
      return data;
    }
    throw new NotFoundException('No encontrado');
  }

  async upsertMany(body: { camaras?: ICreateCamara[] } | ICreateCamara[]) {
    const camaras = Array.isArray(body) ? body : body?.camaras;
    if (!Array.isArray(camaras)) {
      throw new BadRequestException('Listado de camaras requerido');
    }
    return await this.repository.upsertMany(camaras);
  }

  async update(serialCamara: string, data: IUpdateCamara) {
    const updated = await this.repository.update(serialCamara, data);
    if (updated) {
      return updated;
    }
    throw new NotFoundException('No encontrado');
  }
}
