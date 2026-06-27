import { Injectable } from '@nestjs/common';
import { ICrono, IFilter, IQueryParam, ISiembra } from 'modelos/src';
import { CronosRepository } from './repository';

export type TCiclo = 'Corto' | 'Intermedio' | 'Largo';

@Injectable()
export class CronosService {
  constructor(private repository: CronosRepository) {}

  async get(siembra: ISiembra): Promise<ICrono | undefined> {
    if (siembra.crono) {
      return siembra.crono;
    }

    const ciclo = siembra.semilla?.ciclo as TCiclo;
    const cultivo = siembra.semilla?.cultivo;
    const idDepartamento = siembra.idDepartamento;
    const diaSiembra = new Date(siembra.fechaSiembra).getDate();
    const mesSiembra = new Date(siembra.fechaSiembra).getMonth() + 1;

    if (!ciclo || !cultivo) {
      return undefined;
    }

    const filtro: IFilter<ICrono> = {
      ciclo: { $regex: `^${ciclo}$`, $options: 'i' },
      idDepartamento,
      diaSiembra,
      mesSiembra,
      cultivo,
    };
    const cronoExacto = await this.findOne(filtro);
    if (cronoExacto) {
      return cronoExacto;
    }

    const cronoDepartamento = await this.findClosestToSowingDate(
      {
        ciclo: { $regex: `^${ciclo}$`, $options: 'i' },
        idDepartamento,
        cultivo,
      },
      diaSiembra,
      mesSiembra,
    );
    if (cronoDepartamento) {
      return cronoDepartamento;
    }

    return await this.findClosestToSowingDate(
      {
        ciclo: { $regex: `^${ciclo}$`, $options: 'i' },
        cultivo,
        idDepartamento: { $exists: false },
      },
      diaSiembra,
      mesSiembra,
    );
  }

  private async findOne(filtro: IFilter<ICrono>): Promise<ICrono | undefined> {
    const query: IQueryParam = {
      filter: JSON.stringify(filtro),
      limit: 1,
    };
    const resp = await this.repository.get(query);
    return resp.datos[0];
  }

  private async findClosestToSowingDate(
    filtro: IFilter<ICrono>,
    diaSiembra: number,
    mesSiembra: number,
  ): Promise<ICrono | undefined> {
    const query: IQueryParam = {
      filter: JSON.stringify(filtro),
      limit: 0,
    };
    const resp = await this.repository.get(query);
    return resp.datos
      .filter((crono) => crono.diaSiembra && crono.mesSiembra)
      .sort(
        (a, b) =>
          this.diferenciaDiasCalendario(a, diaSiembra, mesSiembra) -
          this.diferenciaDiasCalendario(b, diaSiembra, mesSiembra),
      )[0];
  }

  private diferenciaDiasCalendario(
    crono: ICrono,
    diaSiembra: number,
    mesSiembra: number,
  ): number {
    const objetivo = Date.UTC(2000, mesSiembra - 1, diaSiembra);
    const fechaCrono = Date.UTC(2000, crono.mesSiembra - 1, crono.diaSiembra);
    const diferencia = Math.abs((fechaCrono - objetivo) / 86400000);
    return Math.min(diferencia, 366 - diferencia);
  }
}
