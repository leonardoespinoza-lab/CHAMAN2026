import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IFumigacion,
  ICreateFumigacion,
  IListado,
  IQueryParam,
  IUpdateFumigacion,
  IUsuario,
  IFilter,
  IUpdateAlerta,
  IEstadoAlerta,
  IPopulate,
  IPermiso,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { FumigacionsRepository } from './repository';
import { AlertasService } from '../alerta/service';
import { SiembrasService } from '../siembra/service';

@Injectable()
export class FumigacionsService {
  constructor(
    private repository: FumigacionsRepository,
    private alertas: AlertasService,
    @Inject(forwardRef(() => SiembrasService))
    private siembrasService: SiembrasService,
  ) {}

  async getById(id: string, permiso: IPermiso): Promise<IFumigacion> {
    const data = await this.repository.getById(id);
    if (!this.puedeVer(data, permiso)) {
      throw new Error('No tiene permiso para ver esta fumigacion');
    }
    return data;
  }

  async getByIdSiembra(
    idSiembra: string,
    permiso: IPermiso,
  ): Promise<IListado<IFumigacion>> {
    const filter: IFilter<IFumigacion> = { idSiembra };
    const populate: IPopulate = {
      path: 'principioActivo',
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      populate: JSON.stringify(populate),
    };
    this.agregarFiltroPermiso(query, permiso);
    return await this.repository.get(query);
  }

  async get(
    query: IQueryParam,
    permiso: IPermiso,
  ): Promise<IListado<IFumigacion>> {
    this.agregarFiltroPermiso(query, permiso);
    return await this.repository.get(query);
  }

  async create(
    data: ICreateFumigacion,
    user: IUsuario,
    permiso: IPermiso,
  ): Promise<IFumigacion> {
    const siembra = await this.siembrasService.getById(data.idSiembra, permiso);
    data.idEstablecimiento = siembra.idEstablecimiento;
    data.idProductor = siembra.idProductor;
    data.idDistribuidor = siembra.idDistribuidor;
    data.idQuimica = siembra.idQuimica;
    const [res] = await Promise.all([
      this.repository.create(data),
      this.marcarAlertasTratadas(data, user, permiso),
    ]);
    return res;
  }

  async bulk(data: ICreateFumigacion[]): Promise<void> {
    return await this.repository.bulk(data);
  }

  async update(
    id: string,
    data: IUpdateFumigacion,
    permiso: IPermiso,
  ): Promise<IFumigacion> {
    await this.getById(id, permiso);
    if (!this.puedeVer(data, permiso)) {
      throw new NotFoundException(
        'No tiene permiso para actualizar esta fumigacion',
      );
    }
    return await this.repository.update(id, data);
  }

  async delete(id: string, permiso: IPermiso): Promise<IFumigacion> {
    await this.getById(id, permiso);
    return await this.repository.delete(id);
  }

  async getByIdSiembraAndFechasInternal(
    idSiembra: string,
    desde: string,
    hasta: string,
    // permiso: IPermiso,
  ): Promise<IFumigacion[]> {
    const filter: IFilter<IFumigacion> = {
      idSiembra,
      fechaFumigacion: { $gte: desde, $lte: hasta },
    };
    const populate: IPopulate = {
      path: 'principioActivo',
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      populate: JSON.stringify(populate),
    };
    // this.agregarFiltroPermiso(query, permiso);
    const res = await this.repository.get(query);
    return res.datos;
  }

  // Private

  private async marcarAlertasTratadas(
    data: ICreateFumigacion,
    user: IUsuario,
    permiso: IPermiso,
  ): Promise<void> {
    try {
      const activa = await this.alertas.getUltimaActivaByIdSiembra(
        data.idSiembra,
        permiso,
      );
      if (activa) {
        const estados = activa.estados;
        const estado: IEstadoAlerta = {
          fecha: new Date().toISOString(),
          idUsuario: user._id,
          comentario: `Fumigada por ${user.datosPersonales?.nombre} || ${user.username}`,
          estado: 'Tratada',
        };
        estados.push(estado);
        const update: IUpdateAlerta = {
          activa: false,
          estadoActual: 'Tratada',
          estados,
        };
        await this.alertas.update(activa._id, update, permiso);
      }
    } catch (error) {
      Logger.error('Error al marcar alerta como tratada');
      console.error(error);
    }
  }

  private puedeVer(data: IFumigacion, permiso: IPermiso): boolean {
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
    const filtro: IFilter<IFumigacion> = HelperService.filtroToObject(
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
