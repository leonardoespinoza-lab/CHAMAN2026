import { Injectable } from '@nestjs/common';
import { ICrono, IQueryParam, ISiembra } from 'modelos/src';
import { CronosRepository } from './repository';

export type TCiclo = 'Corto' | 'Intermedio' | 'Largo';

@Injectable()
export class CronosService {
  constructor(private repository: CronosRepository) {}

  async get(siembra: ISiembra): Promise<ICrono | void> {
    const ciclo = siembra.semilla?.ciclo as TCiclo;
    const idDepartamento = siembra.idDepartamento;
    const diaSiembra = new Date(siembra.fechaSiembra).getDate();
    const mesSiembra = new Date(siembra.fechaSiembra).getMonth() + 1;
    const filtro = {
      ciclo: { $regex: `^${ciclo}$`, $options: 'i' },
      idDepartamento,
      diaSiembra,
      mesSiembra,
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filtro),
    };
    const resp = await this.repository.get(query);
    return resp.datos[0];
  }
}
