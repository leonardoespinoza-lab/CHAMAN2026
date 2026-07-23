import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import {
  IQuimica,
  IListado,
  IQueryParam,
  ICreateQuimica,
  IUpdateQuimica,
  IPermiso,
  IFilter,
  ICreateLicenciaPorEntidad,
  IUsuario,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { QuimicasRepository } from './repository';
import { LicenciasService } from '../licencia/service';
import { LicenciaPorEntidadsService } from '../licenciaPorEntidad/service';
import { DistribuidorsRepository } from '../distribuidor/repository';
import { ProductorsRepository } from '../productor/repository';
import { EstablecimientosRepository } from '../establecimiento/repository';
import { LotesRepository } from '../lote/repository';

@Injectable()
export class QuimicasService {
  constructor(
    private repository: QuimicasRepository,
    private licencias: LicenciasService,
    private licenciasPorEntidad: LicenciaPorEntidadsService,
    @Optional() private distribuidoresRepository?: DistribuidorsRepository,
    @Optional() private productoresRepository?: ProductorsRepository,
    @Optional() private establecimientosRepository?: EstablecimientosRepository,
    @Optional() private lotesRepository?: LotesRepository,
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
    const idLicencia = (data.licencia as any)?._id as string | undefined;
    const licencia = idLicencia
      ? await this.licencias.getById(idLicencia)
      : await this.licenciasPorEntidad.getLicenciaDefaultPlan();
    if (!licencia._id)
      throw new BadRequestException(
        'Configure un plan por defecto persistido antes de crear la compania',
      );

    const quimica = await this.repository.create(data);
    const fechaExpiracion = new Date();
    fechaExpiracion.setDate(
      fechaExpiracion.getDate() + (data.expiracion || 30),
    );
    // Creo la licencia por entidad
    const createLicenciaPorEntidad: ICreateLicenciaPorEntidad = {
      idEntidad: quimica._id,
      idLicencia: licencia._id,
      fechaExpiracion: fechaExpiracion.toISOString(),
      fechaInicio: new Date().toISOString(),
      tipoEntidad: 'Quimica',
      estado: 'activa',
      origen: 'sistema',
      motivoCambio: idLicencia
        ? 'Plan seleccionado en el alta'
        : 'Plan por defecto del sistema',
    };
    await this.licenciasPorEntidad.create(createLicenciaPorEntidad);
    return quimica;
  }

  private getLicenciaGratis() {
    return {
      nombre: 'Gratis',
      origen: 'automatico' as const,
      motivoCreacion: 'Alta de quimica sin licencia seleccionada',
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
        tipoEntidad: 'Quimica',
        fechaInicio: new Date().toISOString(),
        fechaExpiracion: fechaExpiracion.toISOString(),
        motivoCambio: 'Cambio desde la administracion de la compania',
      });
      delete data.licencia;
      delete data.expiracion;
      return await this.repository.update(id, data);
    }
  }

  async delete(
    id: string,
    permiso: IPermiso,
    actor?: IUsuario,
  ): Promise<IQuimica> {
    await this.getById(id, permiso);
    const audit = {
      archivadoPor: actor?.username || actor?._id || 'sistema',
      motivoArchivado: 'Compania archivada desde Chaman',
    };
    const filtro = JSON.stringify({ idQuimica: id });
    const [distribuidores, productores, establecimientos, lotes] =
      await Promise.all([
        this.distribuidoresRepository?.get({
          page: 0,
          limit: 0,
          filter: filtro,
          select: '_id',
        }),
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
    await Promise.all(
      (distribuidores?.datos || []).map((item) =>
        this.distribuidoresRepository!.delete(String(item._id), audit),
      ),
    );
    return await this.repository.delete(id, audit);
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
