import { BadRequestException, Injectable } from '@nestjs/common';
import {
  IAlerta,
  ICreateAlerta,
  IListado,
  IQueryParam,
  IUpdateAlerta,
  IUsuario,
  IFilter,
  IEstadoAlerta,
  IPermiso,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { establecimientosDelPermiso } from '../../auxiliares/authorization/alcance-permiso';
import { AlertasRepository } from './repository';
import { SiembrasRepository } from '../siembra/repository';

@Injectable()
export class AlertasService {
  constructor(
    private repository: AlertasRepository,
    private siembrasRepository: SiembrasRepository,
  ) {}

  async getById(id: string, permiso: IPermiso): Promise<IAlerta> {
    const data = await this.repository.getById(id);
    if (!(await this.puedeVer(data, permiso))) {
      throw new Error('No tiene permiso para ver esta alerta');
    }
    return data;
  }

  async get(query: IQueryParam, permiso: IPermiso): Promise<IListado<IAlerta>> {
    await this.agregarFiltroPermiso(query, permiso);
    return await this.repository.get(query);
  }

  async getByIdSiembra(
    idSiembra: string,
    permiso: IPermiso,
  ): Promise<IListado<IAlerta>> {
    const filter: IFilter<IAlerta> = { idSiembra };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
    };
    await this.agregarFiltroPermiso(query, permiso);
    return await this.repository.get(query);
  }

  async getUltimaActivaByIdSiembra(
    idSiembra: string,
    permiso: IPermiso,
  ): Promise<IAlerta> {
    const filter: IFilter<IAlerta> = { idSiembra, activa: true };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      limit: 1,
    };
    await this.agregarFiltroPermiso(query, permiso);
    const res = await this.repository.get(query);
    return res.datos[0];
  }

  async create(data: ICreateAlerta, permiso: IPermiso): Promise<IAlerta> {
    this.assertAdvisorReadOnly(permiso);
    const siembra = await this.siembrasRepository.getById(data.idSiembra);
    if (!this.puedeVerSiembra(siembra, permiso)) {
      throw new Error('No tiene permiso para crear esta alerta');
    }
    data.idLote = siembra.idLote;
    data.idEstablecimiento = siembra.idEstablecimiento;
    data.idProductor = siembra.idProductor;
    data.idDistribuidor = siembra.idDistribuidor;
    data.idQuimica = siembra.idQuimica;
    return await this.repository.create(data);
  }

  async bulk(data: ICreateAlerta[]): Promise<void> {
    return await this.repository.bulk(data);
  }

  async update(
    id: string,
    data: IUpdateAlerta,
    permiso: IPermiso,
  ): Promise<IAlerta> {
    this.assertAdvisorReadOnly(permiso);
    await this.getById(id, permiso);
    return await this.repository.update(id, data);
  }

  async cambiarEstado(
    id: string,
    data: { estado: IEstadoAlerta; activa: boolean },
    user: IUsuario,
    permiso: IPermiso,
  ): Promise<IAlerta> {
    const alerta = await this.getById(id, permiso);
    const estados = alerta.estados || [];
    const estado: IEstadoAlerta = {
      fecha: new Date().toISOString(),
      idUsuario: user._id,
      //Espredea el las keys del objeto, un capo.
      ...data.estado,
    };
    estados.push(estado);
    const update: IUpdateAlerta = {
      estados,
      estadoActual: estado.estado,
      activa: data.activa,
    };
    return await this.repository.update(id, update);
  }

  async delete(id: string, permiso: IPermiso): Promise<IAlerta> {
    this.assertAdvisorReadOnly(permiso);
    await this.getById(id, permiso);
    return await this.repository.delete(id);
  }

  // Private

  private assertAdvisorReadOnly(permiso: IPermiso): void {
    if (permiso.nivel === 'Asesor') {
      throw new BadRequestException(
        'El asesor supervisa las alertas; su alta y edicion corresponden al usuario productor',
      );
    }
  }

  private async puedeVer(data: IAlerta, permiso: IPermiso): Promise<boolean> {
    if (permiso.idLotes?.length) {
      const siembra = await this.siembrasRepository.getById(data.idSiembra);
      if (!this.puedeVerSiembra(siembra, permiso)) return false;
    }
    if (permiso.nivel === 'Admin') {
      return true;
    }
    if (permiso.nivel === 'Quimica') {
      return data.idQuimica === permiso.idQuimica;
    }
    if (permiso.nivel === 'Distribuidor') {
      return data.idDistribuidor === permiso.idDistribuidor;
    }
    if (permiso.nivel === 'Productor') {
      return data.idProductor === permiso.idProductor;
    }
    if (permiso.nivel === 'Establecimiento') {
      return data.idEstablecimiento === permiso.idEstablecimiento;
    }
    if (permiso.nivel === 'Asesor') {
      return establecimientosDelPermiso(permiso).includes(
        String(data.idEstablecimiento),
      );
    }
    return false;
  }

  private async agregarFiltroPermiso(
    query: IQueryParam,
    permiso: IPermiso,
  ): Promise<void> {
    const filtro: IFilter<IAlerta> = HelperService.filtroToObject(query.filter);
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
    if (permiso.nivel === 'Asesor') {
      $and.push({
        idEstablecimiento: { $in: establecimientosDelPermiso(permiso) },
      });
    }
    if (permiso.idLotes?.length) {
      const listado = await this.siembrasRepository.get({
        filter: JSON.stringify({ idLote: { $in: permiso.idLotes } }),
        select: '_id',
        limit: 0,
      });
      $and.push({
        idSiembra: {
          $in: (listado.datos || []).map((item) => String(item._id)),
        },
      });
    }

    if ($and.length > 0) {
      filtro.$and = $and;
      query.filter = JSON.stringify(filtro);
    }
  }

  private puedeVerSiembra(siembra: any, permiso: IPermiso): boolean {
    if (!siembra) return false;
    if (
      permiso.idLotes?.length &&
      (!siembra.idLote || !permiso.idLotes.includes(String(siembra.idLote)))
    ) {
      return false;
    }
    if (permiso.nivel === 'Admin') return true;
    if (permiso.nivel === 'Quimica') {
      return siembra.idQuimica === permiso.idQuimica;
    }
    if (permiso.nivel === 'Distribuidor') {
      return siembra.idDistribuidor === permiso.idDistribuidor;
    }
    if (permiso.nivel === 'Productor') {
      return siembra.idProductor === permiso.idProductor;
    }
    if (permiso.nivel === 'Establecimiento') {
      return siembra.idEstablecimiento === permiso.idEstablecimiento;
    }
    if (permiso.nivel === 'Asesor') {
      return establecimientosDelPermiso(permiso).includes(
        String(siembra.idEstablecimiento),
      );
    }
    return false;
  }
}
