import { Injectable } from '@nestjs/common';
import {
  IPrediccion,
  IListado,
  IQueryParam,
  IPermiso,
  IFilter,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { XlsxService } from '../../auxiliares/xlsx/xlsx.service';
import { PrediccionsRepository } from './repository';

@Injectable()
export class PrediccionsService {
  constructor(
    private repository: PrediccionsRepository,
    private xls: XlsxService,
  ) {}

  async getById(id: string, permiso: IPermiso): Promise<IPrediccion> {
    const data = await this.repository.getById(id);
    if (!this.puedeVer(data, permiso)) {
      throw new Error('No tiene permiso para ver esta prediccion');
    }
    return data;
  }

  async get(
    filtro: IQueryParam,
    permiso: IPermiso,
  ): Promise<IListado<IPrediccion>> {
    this.agregarFiltroPermiso(filtro, permiso);
    return await this.repository.get(filtro);
  }

  async export(filtro: IQueryParam, permiso: IPermiso): Promise<Buffer> {
    const populate = {
      path: 'siembra',
      populate: {
        path: 'semilla',
      },
    };
    filtro.populate = JSON.stringify(populate);
    filtro.limit = 0;
    const data = await this.get(filtro, permiso);
    return await this.xls.predicciones(data.datos);
  }

  async deleteByIdSiembra(idSiembra: string, permiso: IPermiso): Promise<void> {
    const predicciones = await this.get(
      {
        filter: JSON.stringify({ idSiembra }),
        limit: 1,
      },
      permiso,
    );
    if (!predicciones.datos.length) {
      return;
    }
    return await this.repository.deleteByIdSiembra(idSiembra);
  }

  async prediccion(idSiembra: string): Promise<IPrediccion[]> {
    return await this.repository.prediccion(idSiembra);
  }

  // Private

  private puedeVer(data: IPrediccion, permiso: IPermiso): boolean {
    if (permiso.nivel === 'Admin') {
      return true;
    }
    if (permiso.nivel === 'Quimica') {
      return !data.idQuimica || data.idQuimica === permiso.idQuimica;
    }
    if (permiso.nivel === 'Distribuidor') {
      return (
        !data.idDistribuidor || data.idDistribuidor === permiso.idDistribuidor
      );
    }
    if (permiso.nivel === 'Productor') {
      return !data.idProductor || data.idProductor === permiso.idProductor;
    }
    if (permiso.nivel === 'Establecimiento') {
      return (
        !data.idEstablecimiento ||
        data.idEstablecimiento === permiso.idEstablecimiento
      );
    }
    return false;
  }

  private agregarFiltroPermiso(query: IQueryParam, permiso: IPermiso) {
    const filtro: IFilter<IPrediccion> = HelperService.filtroToObject(
      query.filter,
    );
    const $and = filtro.$and || [];

    if (permiso.nivel === 'Quimica') {
      $and.push({ idQuimica: permiso.idQuimica });
    }
    if (permiso.nivel === 'Distribuidor') {
      $and.push({ idDistribuidor: permiso.idDistribuidor });
    }
    if (permiso.nivel === 'Productor') {
      $and.push({ idProductor: permiso.idProductor });
    }
    if (permiso.nivel === 'Establecimiento') {
      $and.push({ idEstablecimiento: permiso.idEstablecimiento });
    }

    if ($and.length > 0) {
      filtro.$and = $and;
      query.filter = JSON.stringify(filtro);
    }
  }
}
