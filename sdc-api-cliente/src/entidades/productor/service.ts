import { BadRequestException, Injectable } from '@nestjs/common';
import {
  IProductor,
  IListado,
  IQueryParam,
  ICreateProductor,
  IUpdateProductor,
  IPermiso,
  IFilter,
  ILicencia,
  ICreateLicenciaPorEntidad,
  IUpdateLicencia,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { ProductorsRepository } from './repository';
import { DistribuidorsService } from '../distribuidor/service';
import { LicenciasService } from '../licencia/service';
import { LicenciaPorEntidadsService } from '../licenciaPorEntidad/service';

@Injectable()
export class ProductorsService {
  constructor(
    private repository: ProductorsRepository,
    private distribuidorsService: DistribuidorsService,
    private licencias: LicenciasService,
    private licenciasPorEntidad: LicenciaPorEntidadsService,
  ) {}

  async getById(id: string, permiso: IPermiso): Promise<IProductor> {
    const res = await this.repository.getById(id);
    if (!this.puedeVer(res, permiso)) {
      throw new Error('No tiene permiso para ver este productor');
    }
    return res;
  }

  async get(
    filtro: IQueryParam,
    permiso: IPermiso,
  ): Promise<IListado<IProductor>> {
    this.agregarFiltroPermiso(filtro, permiso);
    return await this.repository.get(filtro);
  }

  async create(
    data: ICreateProductor,
    permiso: IPermiso,
    licencia: ILicencia,
  ): Promise<IProductor> {
    if (permiso.nivel === 'Admin') {
      if (data.idDistribuidor) {
        const distribuidor = await this.distribuidorsService.getById(
          data.idDistribuidor,
          permiso,
        );
        data.idQuimica = distribuidor.idQuimica;
      }
      return await this.createAdmin(data);
    }

    if (!data.idDistribuidor) {
      data.idDistribuidor = permiso.idDistribuidor;
    }
    const distribuidor = await this.distribuidorsService.getById(
      data.idDistribuidor,
      permiso,
    );
    data.idQuimica = distribuidor.idQuimica;
    // Licencias
    if (false) {
      return await this.createAdmin(data);
    } else {
      // Creados pro química y distribuidor
      // Hereda las licencias del distribuidor o química
      if (!licencia) {
        // Debería tener licencia
        throw new BadRequestException(
          'La química o distribuidor debe tener una licencia para poder crear un productor',
        );
      } 

      const productor = await this.repository.create(data);
      const fechaExpiracion = new Date();
      fechaExpiracion.setDate(new Date().getDate() + data.expiracion || 30);
      const createLicenciaPorEntidad: ICreateLicenciaPorEntidad = {
        idEntidad: productor._id,
        idLicencia: licencia._id,
        fechaExpiracion: fechaExpiracion.toISOString(),
      };
      await this.licenciasPorEntidad.create(createLicenciaPorEntidad);
      return productor;
    }
  }

  private async createAdmin(data: ICreateProductor): Promise<IProductor> {
    // Si lo crea el admin tiene que mandar todo en el create
    // Creo la licencia del productor
    if (!data.licencia) {
      data.licencia = {
        nombre: 'Gratis',
        maxUsuarios: 2,
        maxdDistribuidores: 1,
        maxProductores: 1,
        maxEstablecimientos: 1,
        maxLotes: 1,
        maxdHectareas: 10000,
        modulos: {
          Enfermedades: true,
          Riego: false,
          'Huella Hídrica': false,
          NDVI: true,
          Clima: true,
          'Etapas Fenológicas': true,
        },
      };
      data.expiracion = data.expiracion || 30;
    }
    
    let licencia;
    if ((data.licencia as any)?._id) {
      licencia = data.licencia
    } else {
      licencia = await this.licencias.create(data.licencia);
    }

    const productor = await this.repository.create(data);
    const fechaExpiracion = new Date();
    fechaExpiracion.setDate(new Date().getDate() + data.expiracion || 30);
    // Creo la licencia por entidad
    const createLicenciaPorEntidad: ICreateLicenciaPorEntidad = {
      idEntidad: productor._id,
      idLicencia: licencia._id,
      fechaExpiracion: fechaExpiracion.toISOString(),
    };
    await this.licenciasPorEntidad.create(createLicenciaPorEntidad);
    return productor;
  }

  async createInternal(data: ICreateProductor): Promise<IProductor> {
    return await this.repository.create(data);
  }

  async update(
    id: string,
    data: IUpdateProductor,
    permiso: IPermiso,
  ): Promise<IProductor> {
    await this.getById(id, permiso);
    if (!this.puedeVer(data, permiso)) {
      throw new Error('No tiene permiso para actualizar este productor');
    }
    if (permiso.nivel === 'Admin') {
      return await this.updateAdmin(id, data);
    }
    return await this.repository.update(id, data);
  }

  private async updateAdmin(
    id: string,
    data: IUpdateProductor,
  ): Promise<IProductor> {
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

  async delete(id: string, permiso: IPermiso): Promise<IProductor> {
    await this.getById(id, permiso);
    return await this.repository.delete(id);
  }

  // Private

  private puedeVer(data: IProductor, permiso: IPermiso): boolean {
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
      return !data._id || data._id === permiso.idProductor;
    }
    return false;
  }

  private agregarFiltroPermiso(query: IQueryParam, permiso: IPermiso) {
    const filtro: IFilter<IProductor> = HelperService.filtroToObject(
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
      $and.push({ _id: permiso.idProductor });
    }

    if ($and.length > 0) {
      filtro.$and = $and;
      query.filter = JSON.stringify(filtro);
    }
  }
}
