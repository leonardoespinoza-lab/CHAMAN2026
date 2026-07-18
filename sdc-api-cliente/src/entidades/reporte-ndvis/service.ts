import { Injectable, NotFoundException } from '@nestjs/common';
import {
  IReporteNDVI,
  IListado,
  IQueryParam,
  DeleteResult,
  IPermiso,
  IFilter,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { ReporteNDVIsRepository } from './repository';

@Injectable()
export class ReporteNDVIsService {
  constructor(private repository: ReporteNDVIsRepository) {}

  async getById(id: string, permiso: IPermiso): Promise<IReporteNDVI> {
    const res = await this.repository.getById(id);
    if (!this.puedeVer(res, permiso)) {
      throw new NotFoundException(
        'No tiene permiso para ver este reporte NDVI',
      );
    }
    return res;
  }

  async getLastByLote(permiso: IPermiso): Promise<IReporteNDVI[]> {
    return await this.getLastForPermission(permiso);
  }

  async getLastByLoteByIdDistribuidor(
    permiso: IPermiso,
  ): Promise<IReporteNDVI[]> {
    return await this.getLastForPermission(permiso);
  }

  async get(
    filtro: IQueryParam,
    permiso: IPermiso,
  ): Promise<IListado<IReporteNDVI>> {
    this.agregarFiltroPermiso(filtro, permiso);
    return await this.repository.get(filtro);
  }

  async delete(id: string, permiso: IPermiso): Promise<IReporteNDVI> {
    await this.getById(id, permiso);
    return await this.repository.delete(id);
  }

  async deleteMany(
    query: IQueryParam,
    permiso: IPermiso,
  ): Promise<DeleteResult> {
    this.agregarFiltroPermiso(query, permiso);
    return await this.repository.deleteMany(query);
  }

  // Private

  // Permisos

  private puedeVer(data: IReporteNDVI, permiso: IPermiso): boolean {
    if (permiso.nivel === 'Admin') {
      return true;
    }
    if (permiso.nivel === 'Quimica') {
      return Boolean(
        data.idQuimica && data.idQuimica === permiso.idQuimica,
      );
    }
    if (permiso.nivel === 'Distribuidor') {
      return Boolean(
        data.idDistribuidor &&
          data.idDistribuidor === permiso.idDistribuidor,
      );
    }
    if (permiso.nivel === 'Productor') {
      return Boolean(
        data.idProductor && data.idProductor === permiso.idProductor,
      );
    }
    if (permiso.nivel === 'Establecimiento') {
      return Boolean(
        data.idEstablecimiento &&
          data.idEstablecimiento === permiso.idEstablecimiento,
      );
    }
    return false;
  }

  private agregarFiltroPermiso(query: IQueryParam, permiso: IPermiso) {
    const filtro: IFilter<IReporteNDVI> = HelperService.filtroToObject(
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

  private async getLastForPermission(
    permiso: IPermiso,
  ): Promise<IReporteNDVI[]> {
    if (permiso.nivel === 'Admin') {
      return await this.repository.getLastGlobal();
    }
    const scopes = {
      Quimica: ['quimica', permiso.idQuimica],
      Distribuidor: ['distribuidor', permiso.idDistribuidor],
      Productor: ['productor', permiso.idProductor],
      Establecimiento: ['establecimiento', permiso.idEstablecimiento],
    } as const;
    const resolved = scopes[permiso.nivel as keyof typeof scopes];
    if (!resolved?.[1]) {
      throw new NotFoundException(
        'El permiso no tiene un alcance valido para consultar NDVI',
      );
    }
    return await this.repository.getLastByScope(resolved[0], resolved[1]);
  }
}
