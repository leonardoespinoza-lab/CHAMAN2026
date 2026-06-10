import { BadRequestException, Injectable } from '@nestjs/common';
import {
  IQuimica,
  IListado,
  IQueryParam,
  ICreateQuimica,
  IUpdateQuimica,
  IPermiso,
  IFilter,
  ICreateLicenciaPorEntidad,
  IUpdateLicencia,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { QuimicasRepository } from './repository';
import { LicenciasService } from '../licencia/service';
import { LicenciaPorEntidadsService } from '../licenciaPorEntidad/service';

@Injectable()
export class QuimicasService {
  constructor(
    private repository: QuimicasRepository,
    private licencias: LicenciasService,
    private licenciasPorEntidad: LicenciaPorEntidadsService,
  ) {}

  async getById(id: string, permiso: IPermiso): Promise<IQuimica> {
    const res = await this.repository.getById(id);
    if (!this.puedeVer(res, permiso)) {
      throw new Error('No tiene permiso para ver esta química');
    }
    return res;
  }

  async get(
    query: IQueryParam,
    permiso: IPermiso,
  ): Promise<IListado<IQuimica>> {
    this.agregarFiltroPermiso(query, permiso);
    return await this.repository.get(query);
  }

  async create(data: ICreateQuimica): Promise<IQuimica> {
    // Solo crea admin
    if (!data.licencia) {
      data.licencia = this.getLicenciaGratis();
      data.expiracion = data.expiracion || 30;
    }
    
    let licencia;
    if ((data.licencia as any)?._id) {
      licencia = data.licencia
    } else {
      licencia = await this.licencias.create(data.licencia);
    }

    const quimica = await this.repository.create(data);
    const fechaExpiracion = new Date();
    fechaExpiracion.setDate(new Date().getDate() + data.expiracion || 30);
    // Creo la licencia por entidad
    const createLicenciaPorEntidad: ICreateLicenciaPorEntidad = {
      idEntidad: quimica._id,
      idLicencia: licencia._id,
      fechaExpiracion: fechaExpiracion.toISOString(),
    };
    await this.licenciasPorEntidad.create(createLicenciaPorEntidad);
    return quimica;
  }

  private getLicenciaGratis() {
    return {
      nombre: 'Gratis',
      maxUsuarios: 2,
      maxdDistribuidores: 10,
      maxProductores: 50,
      maxEstablecimientos: 100,
      maxLotes: 500,
      maxdHectareas: 100000,
      modulos: {
        Enfermedades: true,
        Riego: false,
        'Huella Hídrica': false,
        NDVI: true,
        Clima: true,
        'Etapas Fenológicas': true,
      },
    };
  }

  async update(
    id: string,
    data: IUpdateQuimica,
    permiso: IPermiso,
  ): Promise<IQuimica> {
    await this.getById(id, permiso);
    // Solo updatea el admin
    if (!data.licencia) {
      // En update no es obligatorio enviar la licencia, ya que podés updatear la entidad sin cambiar la licencia.
      return await this.repository.update(id, data);
    } else {
      // Si envía la licencia, actualiza la licencia y la licencia por entidad
      // Traigo la licencia que tiene actualmente la química
      let licencia =
        await this.licenciasPorEntidad.getLicenciaValidaByIdEntidad(id);
      if (licencia.default) {
        // No se puede actualizar la licencia por defecto
        // Creo una nueva licencia con lo que mandó el admin
        licencia = await this.licencias.create(data.licencia);
      } else {
        // Si no es la licencia por defecto, actualizo la licencia existente
        // Actualizo solo lo que viene en data.licencia
        const updateLicencia: IUpdateLicencia = {
          ...licencia,
          ...data.licencia,
        };
        // Actualizo la licencia
        await this.licencias.update(licencia._id, updateLicencia);
      }

      if (data.expiracion) {
        // Si envía expiración, actualizo la fecha de expiración de la licencia por entidad
        const fechaExpiracion = new Date();
        fechaExpiracion.setDate(new Date().getDate() + data.expiracion || 30);
        const createLicenciaPorEntidad: ICreateLicenciaPorEntidad = {
          idEntidad: id,
          idLicencia: licencia._id,
          fechaExpiracion: fechaExpiracion.toISOString(),
        };
        await this.licenciasPorEntidad.update(id, createLicenciaPorEntidad);
      }
      return await this.repository.update(id, data);
    }
  }

  async delete(id: string, permiso: IPermiso): Promise<IQuimica> {
    await this.getById(id, permiso);
    return await this.repository.delete(id);
  }

  // Private

  private puedeVer(data: IQuimica, permiso: IPermiso): boolean {
    if (permiso.nivel === 'Admin') {
      return true;
    }
    if (permiso.nivel === 'Quimica') {
      return !data._id || data._id === permiso.idQuimica;
    }
    return false;
  }

  private agregarFiltroPermiso(query: IQueryParam, permiso: IPermiso) {
    const filtro: IFilter<IQuimica> = HelperService.filtroToObject(
      query.filter,
    );
    const $and = filtro.$and || [];

    if (permiso.nivel === 'Quimica') {
      $and.push({ _id: permiso.idQuimica });
    }

    if ($and.length > 0) {
      filtro.$and = $and;
      query.filter = JSON.stringify(filtro);
    }
  }
}
