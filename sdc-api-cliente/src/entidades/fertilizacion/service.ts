import { BadRequestException, Injectable } from '@nestjs/common';
import {
  IFertilizacion,
  ICreateFertilizacion,
  IListado,
  IQueryParam,
  IUpdateFertilizacion,
  IFilter,
  IPopulate,
  IPermiso,
  ILineaFertilizacion,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { establecimientosDelPermiso } from '../../auxiliares/authorization/alcance-permiso';
import { FertilizacionsRepository } from './repository';
import { LotesService } from '../lote/service';
import { FertilizantesService } from '../fertilizante/service';

@Injectable()
export class FertilizacionsService {
  constructor(
    private repository: FertilizacionsRepository,
    private lotesService: LotesService,
    private fertilizantesService: FertilizantesService,
  ) {}

  async getById(id: string, permiso: IPermiso): Promise<IFertilizacion> {
    const res = await this.repository.getById(id);
    if (!this.puedeVer(res, permiso)) {
      throw new Error('No tiene permiso para ver esta fertilizacion');
    }
    return res;
  }

  async getByIdLote(
    idLote: string,
    permiso: IPermiso,
  ): Promise<IListado<IFertilizacion>> {
    const filter: IFilter<IFertilizacion> = { idLote };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      sort: '-fechaFertilizacion',
    };
    this.agregarFiltroPermiso(query, permiso);
    return await this.repository.get(query);
  }

  async getByIdLoteAndFechasInternal(
    idLote: string,
    desde: string,
    hasta: string,
    // permiso: IPermiso,
  ): Promise<IFertilizacion[]> {
    const filter: IFilter<IFertilizacion> = {
      idLote,
      fechaFertilizacion: { $gte: desde, $lte: hasta },
    };
    const populate: IPopulate = {
      path: 'fertilizante',
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      populate: JSON.stringify(populate),
    };
    // this.agregarFiltroPermiso(query, permiso);
    const res = await this.repository.get(query);
    return res.datos;
  }

  async get(
    filtro: IQueryParam,
    permiso: IPermiso,
  ): Promise<IListado<IFertilizacion>> {
    this.agregarFiltroPermiso(filtro, permiso);
    return await this.repository.get(filtro);
  }

  async create(
    data: ICreateFertilizacion,
    permiso: IPermiso,
  ): Promise<IFertilizacion> {
    await this.normalizarLineas(data);
    const lote = await this.lotesService.getById(data.idLote, permiso);
    data.idQuimica = lote.idQuimica;
    data.idDistribuidor = lote.idDistribuidor;
    data.idProductor = lote.idProductor;
    data.idEstablecimiento = lote.idEstablecimiento;
    return await this.repository.create(data);
  }

  async bulk(data: ICreateFertilizacion[]): Promise<void> {
    return await this.repository.bulk(data);
  }

  async update(
    id: string,
    data: IUpdateFertilizacion,
    permiso: IPermiso,
  ): Promise<IFertilizacion> {
    const actual = await this.getById(id, permiso);
    const normalizado = { ...actual, ...data } as ICreateFertilizacion;
    await this.normalizarLineas(normalizado);
    data.lineas = normalizado.lineas;
    data.idFertilizante = normalizado.idFertilizante;
    data.dosisKgHa = normalizado.dosisKgHa;
    return await this.repository.update(id, data);
  }

  async delete(id: string, permiso: IPermiso): Promise<IFertilizacion> {
    await this.getById(id, permiso);
    return await this.repository.delete(id);
  }

  // Private

  private async normalizarLineas(
    data: ICreateFertilizacion | IUpdateFertilizacion,
  ): Promise<void> {
    const recibidas = Array.isArray(data.lineas) && data.lineas.length
      ? data.lineas
      : [{
          idFertilizante: data.idFertilizante,
          dosisKgHa: data.dosisKgHa,
        }];
    if (!recibidas.length || recibidas.length > 12) {
      throw new BadRequestException(
        'La aplicacion debe incluir entre 1 y 12 fertilizantes.',
      );
    }
    const ids = recibidas.map((linea) => String(linea.idFertilizante || '').trim());
    if (ids.some((id) => !id)) {
      throw new BadRequestException('Cada linea debe indicar un fertilizante.');
    }
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Un fertilizante no puede repetirse dentro de la misma aplicacion.',
      );
    }
    const fertilizantes = await Promise.all(
      ids.map((id) => this.fertilizantesService.getById(id)),
    );
    const lineas: ILineaFertilizacion[] = recibidas.map((linea, index) => {
      const dosisKgHa = Number(linea.dosisKgHa);
      if (!Number.isFinite(dosisKgHa) || dosisKgHa <= 0) {
        throw new BadRequestException(
          'La dosis de cada fertilizante debe ser mayor que cero.',
        );
      }
      const fertilizante = fertilizantes[index];
      return {
        idFertilizante: ids[index],
        dosisKgHa,
        fertilizante: {
          _id: fertilizante._id,
          nombre: fertilizante.nombre,
          porcentajeN: fertilizante.porcentajeN,
          porcentajeP: fertilizante.porcentajeP,
        },
      };
    });
    data.lineas = lineas;
    data.idFertilizante = lineas[0].idFertilizante;
    data.dosisKgHa = lineas[0].dosisKgHa;
  }

  // Permisos

  private puedeVer(data: IFertilizacion, permiso: IPermiso): boolean {
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
    if (permiso.nivel === 'Asesor') {
      return (
        !!data.idEstablecimiento &&
        establecimientosDelPermiso(permiso).includes(
          String(data.idEstablecimiento),
        ) &&
        (!permiso.idLotes?.length ||
          permiso.idLotes.includes(String(data.idLote)))
      );
    }
    return false;
  }

  private agregarFiltroPermiso(query: IQueryParam, permiso: IPermiso) {
    const filtro: IFilter<IFertilizacion> = HelperService.filtroToObject(
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
    if (permiso.nivel === 'Asesor') {
      $and.push({
        idEstablecimiento: { $in: establecimientosDelPermiso(permiso) },
      });
    }
    if (permiso.idLotes?.length)
      $and.push({ idLote: { $in: permiso.idLotes } });

    if ($and.length > 0) {
      filtro.$and = $and;
      query.filter = JSON.stringify(filtro);
    }
  }
}
