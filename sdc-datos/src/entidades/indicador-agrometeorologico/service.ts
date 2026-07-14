import { Injectable } from '@nestjs/common';
import { ICreateIndicadorAgrometeorologico, IQueryParam } from 'modelos/src';
import { IndicadoresAgrometeorologicosRepository } from './repository';

@Injectable()
export class IndicadoresAgrometeorologicosService {
  constructor(private repository: IndicadoresAgrometeorologicosRepository) {}

  getFilter(query: IQueryParam) {
    return this.repository.getFilter(query);
  }

  upsertMany(data: ICreateIndicadorAgrometeorologico[]) {
    return this.repository.upsertMany(data || []);
  }

  deleteBySowing(idSiembra: string) {
    return this.repository.deleteBySowing(idSiembra);
  }
}
