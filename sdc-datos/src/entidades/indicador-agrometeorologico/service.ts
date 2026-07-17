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

  acquireGenerationLease(
    idSiembra: string,
    versionCalculo: string,
    generacionCalculo: string,
  ) {
    return this.repository.acquireGenerationLease(
      idSiembra,
      versionCalculo,
      generacionCalculo,
    );
  }

  releaseGenerationLease(
    idSiembra: string,
    versionCalculo: string,
    generacionCalculo: string,
  ) {
    return this.repository.releaseGenerationLease(
      idSiembra,
      versionCalculo,
      generacionCalculo,
    );
  }

  replaceGeneration(
    idSiembra: string,
    versionCalculo: string,
    generacionCalculo: string,
    data: ICreateIndicadorAgrometeorologico[],
    intervaloEsperado: {
      desde: string;
      hasta: string;
      cantidad: number;
      checksumFechas: string;
    },
  ) {
    return this.repository.replaceGeneration(
      idSiembra,
      versionCalculo,
      generacionCalculo,
      data,
      intervaloEsperado,
    );
  }

  getActiveGeneration(idSiembra: string, versionCalculo: string) {
    return this.repository.getActiveGeneration(idSiembra, versionCalculo);
  }
}
