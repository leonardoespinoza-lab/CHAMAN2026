import { BadRequestException, Injectable, Optional } from '@nestjs/common';
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
  IUsuario,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { DistribuidorsRepository } from './repository';
import { LicenciasService } from '../licencia/service';
import { LicenciaPorEntidadsService } from '../licenciaPorEntidad/service';
import { ProductorsRepository } from '../productor/repository';
import { EstablecimientosRepository } from '../establecimiento/repository';
import { LotesRepository } from '../lote/repository';

@Injectable()
export class DistribuidorsService {
  constructor(
    private repository: DistribuidorsRepository,
    private licencias: LicenciasService,
    private licenciasPorEntidad: LicenciaPorEntidadsService,
    @Optional() private productoresRepository?: ProductorsRepository,
    @Optional() private establecimientosRepository?: EstablecimientosRepository,
    @Optional() private lotesRepository?: LotesRepository,
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
      // Hereda el plan de la compania. No se duplica una asignacion que pueda
      // divergir silenciosamente del contrato superior.
      return await this.repository.create(data);
    }
  }

  private async createAdmin(data: ICreateDistribuidor): Promise<IDistribuidor> {
    const idLicencia = (data.licencia as any)?._id as string | undefined;
    const licencia = idLicencia
      ? await this.licencias.getById(idLicencia)
      : await this.licenciasPorEntidad.getLicenciaDefaultPlan();
    if (!licencia._id)
      throw new BadRequestException(
        'Configure un plan por defecto persistido antes de crear el distribuidor',
      );

    const distribuidor = await this.repository.create(data);
    const fechaExpiracion = new Date();
    fechaExpiracion.setDate(
      fechaExpiracion.getDate() + (data.expiracion || 30),
    );
    const createLicenciaPorEntidad: ICreateLicenciaPorEntidad = {
      idEntidad: distribuidor._id,
      idLicencia: licencia._id,
      fechaExpiracion: fechaExpiracion.toISOString(),
      fechaInicio: new Date().toISOString(),
      tipoEntidad: 'Distribuidor',
      estado: 'activa',
      origen: 'sistema',
      motivoCambio: idLicencia
        ? 'Plan seleccionado en el alta'
        : 'Plan por defecto del sistema',
    };
    await this.licenciasPorEntidad.create(createLicenciaPorEntidad);
    return distribuidor;
  }

  private getLicenciaGratis() {
    return {
      nombre: 'Gratis',
      origen: 'automatico' as const,
      motivoCreacion: 'Alta de distribuidor sin licencia seleccionada',
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
    delete data.licencia;
    delete data.expiracion;
    return await this.repository.update(id, data);
  }

  private async updateAdmin(id: string, data: IUpdateDistribuidor) {
    if (!data.licencia) {
      // En update no es obligatorio enviar la licencia, ya que podés updatear la entidad sin cambiar la licencia.
      return await this.repository.update(id, data);
    }
    const idLicencia = (data.licencia as any)?._id as string | undefined;
    if (!idLicencia) {
      throw new BadRequestException(
        'Seleccione un plan existente; los planes se crean desde Gestion de licencias',
      );
    }
    const fechaExpiracion = new Date();
    fechaExpiracion.setDate(
      fechaExpiracion.getDate() + (data.expiracion || 30),
    );
    await this.licenciasPorEntidad.asignar(id, {
      idLicencia,
      tipoEntidad: 'Distribuidor',
      fechaInicio: new Date().toISOString(),
      fechaExpiracion: fechaExpiracion.toISOString(),
      motivoCambio: 'Cambio desde la administracion del distribuidor',
    });
    delete data.licencia;
    delete data.expiracion;
    return await this.repository.update(id, data);
  }

  async delete(
    id: string,
    permiso: IPermiso,
    actor?: IUsuario,
  ): Promise<IDistribuidor> {
    await this.getById(id, permiso);
    const audit = {
      archivadoPor: actor?.username || actor?._id || 'sistema',
      motivoArchivado: 'Distribuidor archivado desde Chaman',
    };
    const filtro = JSON.stringify({ idDistribuidor: id });
    const [productores, establecimientos, lotes] = await Promise.all([
      this.productoresRepository?.get({
        page: 0,
        limit: 0,
        filter: filtro,
        select: '_id',
      }),
      this.establecimientosRepository?.get({
        page: 0,
        limit: 0,
        filter: filtro,
        select: '_id',
      }),
      this.lotesRepository?.get({
        page: 0,
        limit: 0,
        filter: filtro,
        select: '_id',
      }),
    ]);
    await Promise.all(
      (lotes?.datos || []).map((item) =>
        this.lotesRepository!.delete(String(item._id), audit),
      ),
    );
    await Promise.all(
      (establecimientos?.datos || []).map((item) =>
        this.establecimientosRepository!.delete(String(item._id), audit),
      ),
    );
    await Promise.all(
      (productores?.datos || []).map((item) =>
        this.productoresRepository!.delete(String(item._id), audit),
      ),
    );
    return await this.repository.delete(id, audit);
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
