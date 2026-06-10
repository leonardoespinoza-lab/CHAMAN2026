import { BadRequestException, Injectable } from '@nestjs/common';
import {
  IDistribuidor,
  IListado,
  IQueryParam,
  ICreateDistribuidor,
  IUpdateDistribuidor,
  IPermiso,
  IFilter,
  ICreateLicenciaPorEntidad,
  ILicencia,
  IUpdateLicencia,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { DistribuidorsRepository } from './repository';
import { LicenciasService } from '../licencia/service';
import { LicenciaPorEntidadsService } from '../licenciaPorEntidad/service';

@Injectable()
export class DistribuidorsService {
  constructor(
    private repository: DistribuidorsRepository,
    private licencias: LicenciasService,
    private licenciasPorEntidad: LicenciaPorEntidadsService,
  ) {}

  async getById(id: string, permiso: IPermiso): Promise<IDistribuidor> {
    const res = await this.repository.getById(id);
    if (!this.puedeVer(res, permiso)) {
      throw new Error('No tiene permiso para ver este distribuidor');
    }
    return res;
  }

  async get(
    query: IQueryParam,
    permiso: IPermiso,
  ): Promise<IListado<IDistribuidor>> {
    this.agregarFiltroPermiso(query, permiso);
    return await this.repository.get(query);
  }

  async create(
    data: ICreateDistribuidor,
    permiso: IPermiso,
    licencia: ILicencia,
  ): Promise<IDistribuidor> {
    if (!data.idQuimica) {
      data.idQuimica = permiso.idQuimica;
    }
    //data.idQuimica = permiso.idQuimica;
    if (!this.puedeVer(data, permiso)) {
      throw new Error('No tiene permiso para crear este distribuidor');
    }

    // Licencias
    if (permiso.nivel === 'Admin') {
      return await this.createAdmin(data);
    } else {
      // Creados por química
      // Hereda las licencia
      if (!licencia) {
        // Debería tener licencia
        throw new BadRequestException(
          'La química debe tener una licencia para poder crear un productor',
        );
      }
      const distribuidor = await this.repository.create(data);
      const fechaExpiracion = new Date();
      fechaExpiracion.setDate(new Date().getDate() + data.expiracion || 30);
      const createLicenciaPorEntidad: ICreateLicenciaPorEntidad = {
        idEntidad: distribuidor._id,
        idLicencia: licencia._id,
        fechaExpiracion: fechaExpiracion.toISOString(),
      };
      await this.licenciasPorEntidad.create(createLicenciaPorEntidad);
      return distribuidor;
    }
  }

  private async createAdmin(data: ICreateDistribuidor): Promise<IDistribuidor> {
    // Si lo crea el admin tiene que mandar todo en el create
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

    const distribuidor = await this.repository.create(data);
    const fechaExpiracion = new Date();
    fechaExpiracion.setDate(new Date().getDate() + data.expiracion || 30);
    // Creo la licencia por entidad
    const createLicenciaPorEntidad: ICreateLicenciaPorEntidad = {
      idEntidad: distribuidor._id,
      idLicencia: licencia._id,
      fechaExpiracion: fechaExpiracion.toISOString(),
    };
    await this.licenciasPorEntidad.create(createLicenciaPorEntidad);
    return distribuidor;
  }

  private getLicenciaGratis() {
    return {
      nombre: 'Gratis',
      maxUsuarios: 2,
      maxdDistribuidores: 1,
      maxProductores: 25,
      maxEstablecimientos: 50,
      maxLotes: 250,
      maxdHectareas: 50000,
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
    data: IUpdateDistribuidor,
    permiso: IPermiso,
  ): Promise<IDistribuidor> {
    await this.getById(id, permiso);
    if (!this.puedeVer(data, permiso)) {
      throw new Error('No tiene permiso para actualizar este distribuidor');
    }
    if (permiso.nivel === 'Admin') {
      // Si lo updatea el admin, puede enviar la licencia
      return await this.updateAdmin(id, data);
    }
    return await this.repository.update(id, data);
  }

  private async updateAdmin(id: string, data: IUpdateDistribuidor) {
    if (!data.licencia) {
      // En update no es obligatorio enviar la licencia, ya que podés updatear la entidad sin cambiar la licencia.
      return await this.repository.update(id, data);
    }
    // Si envía la licencia, actualiza la licencia y la licencia por entidad
    // Traigo la licencia que tiene actualmente el distribuidor
    let licencia =
      await this.licenciasPorEntidad.getLicenciaValidaByIdEntidad(id);
    if (licencia.default) {
      // No se puede actualizar la licencia por defecto
      // Creo una nueva licencia con lo que mandó el admin
      licencia = await this.licencias.create(data.licencia);
    } else {
      // Actualizo la licencia
      // Actualizo solo lo que viene en data.licencia
      const updateLicencia: IUpdateLicencia = {
        ...licencia,
        ...data.licencia,
      };
      await this.licencias.update(licencia._id, updateLicencia);
    }

    if (data.expiracion) {
      // Si vine con update la licencia, actualizo la fecha de expiración
      const fechaExpiracion = new Date();
      fechaExpiracion.setDate(new Date().getDate() + data.expiracion || 30);
      const createLicenciaPorEntidad: ICreateLicenciaPorEntidad = {
        idEntidad: id,
        idLicencia: licencia._id,
        fechaExpiracion: fechaExpiracion.toISOString(),
      };
      await this.licenciasPorEntidad.create(createLicenciaPorEntidad);
    }
    return await this.repository.update(id, data);
  }

  async delete(id: string, permiso: IPermiso): Promise<IDistribuidor> {
    await this.getById(id, permiso);
    return await this.repository.delete(id);
  }

  // Private

  private puedeVer(data: IDistribuidor, permiso: IPermiso): boolean {
    if (permiso.nivel === 'Admin') {
      return true;
    }
    if (permiso.nivel === 'Quimica') {
      return !data.idQuimica || data.idQuimica === permiso.idQuimica;
    }
    if (permiso.nivel === 'Distribuidor') {
      return !data._id || data._id === permiso.idDistribuidor;
    }

    return false;
  }

  private agregarFiltroPermiso(query: IQueryParam, permiso: IPermiso) {
    const filtro: IFilter<IDistribuidor> = HelperService.filtroToObject(
      query.filter,
    );
    const $and = filtro.$and || [];

    if (permiso.nivel === 'Quimica') {
      $and.push({ idQuimica: permiso.idQuimica });
    }
    if (permiso.nivel === 'Distribuidor') {
      $and.push({ _id: permiso.idDistribuidor });
    }

    if ($and.length > 0) {
      filtro.$and = $and;
      query.filter = JSON.stringify(filtro);
    }
  }
}
