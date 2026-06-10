import { Injectable } from '@nestjs/common';
import { OmixomRepository } from './repository';

@Injectable()
export class OmixomService {
  constructor(private repository: OmixomRepository) {}

  async getEstaciones() {
    return await this.repository.getEstaciones();
  }

  async getMuestrasPorRangoEIdsEstaciones(
    idsEstaciones: number[],
    fechaInicio: string,
    fechaFin?: string,
    limit?: number,
  ) {
    return await this.repository.getMuestrasPorRangoEIdsEstaciones(
      idsEstaciones,
      fechaInicio,
      fechaFin,
      limit,
    );
  }

  async getTodasLasMuestras(
    fechaInicio: string,
    fechaFin?: string,
    limit?: number,
  ) {
    return await this.repository.getTodasLasMuestras(
      fechaInicio,
      fechaFin,
      limit,
    );
  }

  async getUltimaMuestraPorIdEstaciones(idsEstaciones: number[]) {
    return await this.repository.getUltimaMuestraPorIdEstaciones(idsEstaciones);
  }

  async getUltimasMuestras() {
    return await this.repository.getUltimasMuestras();
  }
}
