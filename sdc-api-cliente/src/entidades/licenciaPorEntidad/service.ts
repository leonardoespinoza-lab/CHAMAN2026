import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ILicenciaPorEntidad,
  IListado,
  IQueryParam,
  ICreateLicenciaPorEntidad,
  IUpdateLicenciaPorEntidad,
  IUsuario,
  IFilter,
  ILicencia,
  IPopulate,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { LicenciaPorEntidadsRepository } from './repository';
import { LicenciasService } from '../licencia/service';

@Injectable()
export class LicenciaPorEntidadsService {
  private licenciaDefault?: ILicencia;
  constructor(
    private repository: LicenciaPorEntidadsRepository,
    private licencias: LicenciasService,
  ) {}

  async getById(id: string): Promise<ILicenciaPorEntidad> {
    return await this.repository.getById(id);
  }

  async getLicenciaValidaByIdEntidad(id: string): Promise<ILicencia> {
    const filter: IFilter<ILicenciaPorEntidad> = {
      idEntidad: id,
      fechaExpiracion: { $gte: new Date().toISOString() }, // Licencias que no están vencidas
    };
    const populate: IPopulate = {
      path: 'licencia',
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      populate: JSON.stringify(populate),
      limit: 1,
      sort: '-fechaCreacion',
    };
    const res = await this.getInternal(query);
    const licencia = res.datos[0];
    /// Si no hay licencia, devuelvo default
    if (!licencia) {
      return this.licenciaDefault;
    } else if (
      new Date(licencia.fechaExpiracion).getTime() < new Date().getTime()
    ) {
      // Si está vencida, devuelvo la licencia por defecto.
      if (!this.licenciaDefault) {
        const filter: IFilter<ILicencia> = {
          default: true,
        };
        const query: IQueryParam = {
          filter: JSON.stringify(filter),
          limit: 1,
          sort: 'fechaCreacion', // La primera que se creó (Porque solo debería haber una)
        };
        const res = await this.licencias.getInternal(query);
        if (res.datos.length > 0) {
          this.licenciaDefault = res.datos[0];
        } else {
          throw new BadRequestException(
            'No hay licencia por defecto configurada',
          );
        }
      }
      return this.licenciaDefault;
    }
    // Si no está vencida, devuelvo la licencia.
    return res.datos[0].licencia;
  }

  async get(
    filtro: IQueryParam,
    user: IUsuario,
  ): Promise<IListado<ILicenciaPorEntidad>> {
    this.agregarFiltroPermisos(filtro, user);
    return await this.repository.get(filtro);
  }

  async getInternal(
    filtro: IQueryParam,
  ): Promise<IListado<ILicenciaPorEntidad>> {
    return await this.repository.get(filtro);
  }

  async create(data: ICreateLicenciaPorEntidad): Promise<ILicenciaPorEntidad> {
    // Genero la key.
    return await this.repository.create(data);
  }

  async update(
    id: string,
    data: IUpdateLicenciaPorEntidad,
  ): Promise<ILicenciaPorEntidad> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<ILicenciaPorEntidad> {
    return await this.repository.delete(id);
  }

  // Private

  private agregarFiltroPermisos(params: IQueryParam, user: IUsuario) {
    const filtro = HelperService.filtroToObject(params.filter);
    const $and = filtro.$and || [];
    const $or = [];
    const productoresUsusario = user.permisos
      .filter((p) => p.nivel === 'Productor')
      .map((p) => p.idProductor);
    const licenciaporentidadesUsuario = user.permisos
      .filter((p) => p.nivel === 'Establecimiento')
      .map((p) => p.idEstablecimiento);

    if (productoresUsusario.length > 0) {
      $or.push({ idProductor: { $in: productoresUsusario } });
    }
    if (licenciaporentidadesUsuario.length > 0) {
      $or.push({ _id: { $in: licenciaporentidadesUsuario } });
    }
    if ($or.length > 0) {
      $and.push({ $or });
    }
    if ($and.length > 0) {
      filtro.$and = $and;
      params.filter = JSON.stringify(filtro);
    }
  }
}
