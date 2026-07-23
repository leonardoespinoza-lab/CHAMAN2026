import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  IFilter,
  IEstacion,
  ICreateEstacion,
  IListado,
  IQueryParam,
  IUpdateEstacion,
  IPermiso,
  IEstablecimiento,
} from 'modelos/src';
import { EstacionsRepository } from './repository';
import { HelperService } from '../../auxiliares/helper';
import { EstablecimientosRepository } from '../establecimiento/repository';
import { establecimientosDelPermiso } from '../../auxiliares/authorization/alcance-permiso';

@Injectable()
export class EstacionsService {
  constructor(
    private repository: EstacionsRepository,
    private establecimientosRepository: EstablecimientosRepository,
  ) {}

  async getById(id: string, permiso?: IPermiso): Promise<IEstacion> {
    const estacion = await this.repository.getById(id);
    if (permiso && !(await this.puedeVer(estacion, permiso))) {
      throw new ForbiddenException('No tiene permiso para ver esta estacion');
    }
    return estacion;
  }

  async getFiltered(
    query: IQueryParam,
    permiso?: IPermiso,
  ): Promise<IListado<IEstacion>> {
    if (permiso) await this.agregarFiltroPermiso(query, permiso);
    return await this.repository.getFiltered(query);
  }

  async create(data: ICreateEstacion): Promise<IEstacion> {
    return await this.repository.create(data);
  }

  async update(id: string, data: IUpdateEstacion): Promise<IEstacion> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IEstacion> {
    return await this.repository.delete(id);
  }

  //

  async getSueloFiltered(
    query: IQueryParam,
    permiso: IPermiso,
  ): Promise<IListado<IEstacion>> {
    this.agregarFiltroSuelo(query);
    await this.agregarFiltroPermiso(query, permiso);
    return await this.repository.getFiltered(query);
  }

  // Private
  private agregarFiltroSuelo(query: IQueryParam): void {
    const filter = HelperService.filtroToObject(query.filter);
    filter[`meta.soilTemp`] = { $exists: true };
    filter[`meta.volumetricAverage`] = { $exists: true };
    query.filter = JSON.stringify(filter);
  }

  private async puedeVer(
    estacion: IEstacion,
    permiso: IPermiso,
  ): Promise<boolean> {
    if (permiso.nivel === 'Admin') return true;
    const ids = await this.idsEstablecimientosPermitidos(permiso);
    return Boolean(
      estacion?.idEstablecimiento &&
      ids.includes(String(estacion.idEstablecimiento)),
    );
  }

  private async agregarFiltroPermiso(
    query: IQueryParam,
    permiso: IPermiso,
  ): Promise<void> {
    if (permiso.nivel === 'Admin') return;
    const ids = await this.idsEstablecimientosPermitidos(permiso);
    const filter: IFilter<IEstacion> = HelperService.filtroToObject(
      query.filter,
    );
    const $and = filter.$and || [];
    $and.push({ idEstablecimiento: { $in: ids } });
    filter.$and = $and;
    query.filter = JSON.stringify(filter);
  }

  private async idsEstablecimientosPermitidos(
    permiso: IPermiso,
  ): Promise<string[]> {
    if (permiso.nivel === 'Establecimiento') {
      return permiso.idEstablecimiento
        ? [String(permiso.idEstablecimiento)]
        : [];
    }
    if (permiso.nivel === 'Asesor') {
      return establecimientosDelPermiso(permiso);
    }

    const filter: IFilter<IEstablecimiento> = {};
    if (permiso.nivel === 'Quimica') filter.idQuimica = permiso.idQuimica;
    if (permiso.nivel === 'Distribuidor') {
      filter.idDistribuidor = permiso.idDistribuidor;
    }
    if (permiso.nivel === 'Productor') {
      filter.idProductor = permiso.idProductor;
    }
    const listado = await this.establecimientosRepository.get({
      filter: JSON.stringify(filter),
      select: '_id',
      limit: 0,
    });
    return (listado.datos || []).map((item) => String(item._id));
  }
}
