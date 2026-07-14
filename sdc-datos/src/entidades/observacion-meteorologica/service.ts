import { Injectable } from '@nestjs/common';
import { ICreateObservacionMeteorologica, IQueryParam } from 'modelos/src';
import { ObservacionesMeteorologicasRepository } from './repository';

@Injectable()
export class ObservacionesMeteorologicasService {
  constructor(private repository: ObservacionesMeteorologicasRepository) {}

  getFilter(query: IQueryParam) {
    return this.repository.getFilter(query);
  }

  upsertMany(data: ICreateObservacionMeteorologica[]) {
    return this.repository.upsertMany(data || []);
  }

  deleteRange(idEstablecimiento: string, desde: string, hasta: string) {
    return this.repository.deleteRange(idEstablecimiento, desde, hasta);
  }
}
