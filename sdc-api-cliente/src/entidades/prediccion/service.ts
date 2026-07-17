import { Injectable } from '@nestjs/common';
import {
  IPrediccion,
  IListado,
  IQueryParam,
  IPermiso,
  IFilter,
  IResumenRiesgosAgroclimaticos,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { XlsxService } from '../../auxiliares/xlsx/xlsx.service';
import { PrediccionsRepository } from './repository';
import { LotesService } from '../lote/service';

@Injectable()
export class PrediccionsService {
  constructor(
    private repository: PrediccionsRepository,
    private xls: XlsxService,
    private lotesService: LotesService,
  ) {}

  async getById(id: string, permiso: IPermiso): Promise<IPrediccion> {
    const data = await this.repository.getById(id);
    await this.autorizarSiembra(data.idSiembra, permiso);
    return data;
  }

  async get(
    filtro: IQueryParam,
    permiso: IPermiso,
  ): Promise<IListado<IPrediccion>> {
    this.agregarFiltroPermiso(filtro, permiso);
    return await this.repository.get(filtro);
  }

  async export(filtro: IQueryParam, permiso: IPermiso): Promise<Buffer> {
    const populate = {
      path: 'siembra',
      populate: {
        path: 'semilla',
      },
    };
    filtro.populate = JSON.stringify(populate);
    filtro.limit = 0;
    const data = await this.get(filtro, permiso);
    return await this.xls.predicciones(data.datos);
  }

  async deleteByIdSiembra(idSiembra: string, permiso: IPermiso): Promise<void> {
    // La autorizacion se resuelve contra la siembra/lote canonicos. Consultar
    // primero predicciones por tenant dejaba documentos legacy invisibles y,
    // por lo tanto, sin borrar antes de reconstruir el motor sanitario.
    await this.autorizarSiembra(idSiembra, permiso);
    return await this.repository.deleteByIdSiembra(idSiembra);
  }

  async prediccion(idSiembra: string): Promise<IPrediccion[]> {
    return await this.repository.prediccion(idSiembra);
  }

  async reconstruir(
    idSiembra: string,
    permiso: IPermiso,
  ): Promise<IPrediccion[]> {
    await this.autorizarSiembra(idSiembra, permiso);
    return await this.repository.reconstruir(idSiembra);
  }

  async agroclima(
    idSiembra: string,
    permiso?: IPermiso,
  ): Promise<IResumenRiesgosAgroclimaticos> {
    if (permiso) {
      await this.autorizarSiembra(idSiembra, permiso);
    }
    return await this.repository.agroclima(idSiembra);
  }

  // Private

  private puedeVerSiembra(
    data: Partial<IPrediccion>,
    permiso: IPermiso,
  ): boolean {
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

  private tieneAlcancePersistido(
    data: Partial<IPrediccion>,
    permiso: IPermiso,
  ): boolean {
    if (permiso.nivel === 'Quimica') return Boolean(data.idQuimica);
    if (permiso.nivel === 'Distribuidor') {
      return Boolean(data.idDistribuidor);
    }
    if (permiso.nivel === 'Productor') return Boolean(data.idProductor);
    if (permiso.nivel === 'Establecimiento') {
      return Boolean(data.idEstablecimiento);
    }
    return permiso.nivel === 'Admin';
  }

  private async autorizarSiembra(
    idSiembra: string | undefined,
    permiso: IPermiso,
  ): Promise<void> {
    if (permiso.nivel === 'Admin') return;
    if (!idSiembra) {
      throw new Error('La prediccion no tiene una siembra canonica asociada');
    }
    const siembra = await this.repository.getSiembraById(idSiembra);
    if (this.puedeVerSiembra(siembra, permiso)) return;

    if (
      !this.tieneAlcancePersistido(siembra, permiso) &&
      siembra.idLote
    ) {
      try {
        await this.lotesService.getById(siembra.idLote, permiso);
        return;
      } catch {
        // Solo un lote canonico autorizado habilita compatibilidad legacy.
        // Un tenant persistido que no coincide nunca cae a esta ruta.
      }
    }
    throw new Error('No tiene permiso para evaluar esta siembra');
  }

  private agregarFiltroPermiso(query: IQueryParam, permiso: IPermiso) {
    const filtro: IFilter<IPrediccion> = HelperService.filtroToObject(
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
