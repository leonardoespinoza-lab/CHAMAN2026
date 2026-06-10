import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  ILote,
  IListado,
  IQueryParam,
  ICreateLote,
  IUpdateLote,
  IFilter,
  IReporteNDVI,
  IPermiso,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { LotesRepository } from './repository';
import { EstablecimientosService } from '../establecimiento/service';
import { ReporteNDVIsService } from '../reporte-ndvis/service';
import { NdviQueueService } from './ndvi-queue.service';

@Injectable()
export class LotesService {
  private readonly logger = new Logger(LotesService.name);

  constructor(
    private repository: LotesRepository,
    private establecimientosService: EstablecimientosService,
    private reportesNDVIsService: ReporteNDVIsService,
    private ndviQueue: NdviQueueService,
  ) {}

  async getById(id: string, permiso: IPermiso): Promise<ILote> {
    const data = await this.repository.getById(id);
    if (!this.puedeVer(data, permiso)) {
      throw new BadRequestException('No tiene permiso para ver este lote');
    }
    return data;
  }

  async get(filtro: IQueryParam, permiso: IPermiso): Promise<IListado<ILote>> {
    this.agregarFiltroPermiso(filtro, permiso);
    return await this.repository.get(filtro);
  }

  async create(data: ICreateLote, permiso): Promise<ILote> {
    if (data.ubicacion?.poligono?.length) {
      data.ubicacion.geojson = {
        type: 'Polygon',
        coordinates: [HelperService.polyToGeojson(data.ubicacion.poligono)],
      };
    }
    if (!data.idEstablecimiento) {
      data.idEstablecimiento = permiso.idEstablecimiento;
    }
    const establecimiento = await this.establecimientosService.getById(
      data.idEstablecimiento,
      permiso,
    );
    data.idProductor = establecimiento.idProductor;
    data.idDistribuidor = establecimiento.idDistribuidor;
    data.idQuimica = establecimiento.idQuimica;
    if (!this.puedeVer(data, permiso)) {
      throw new BadRequestException(
        'No tiene permiso para crear este establecimiento',
      );
    }

    const lote = await this.repository.create(data);
    // Fire-and-forget: no bloquea la respuesta al cliente
    this.ndviQueue
      .enqueueLote(lote)
      .catch((err) => this.logger.error(`Error encolando tarea NDVI: ${err.message}`));
    return lote;
  }

  async update(
    id: string,
    data: IUpdateLote,
    permiso: IPermiso,
  ): Promise<ILote> {
    await this.getById(id, permiso);
    if (data.ubicacion?.poligono?.length) {
      data.ubicacion.geojson = {
        type: 'Polygon',
        coordinates: [HelperService.polyToGeojson(data.ubicacion.poligono)],
      };
    }

    if (data.idEstablecimiento) {
      const establecimiento = await this.establecimientosService.getById(
        data.idEstablecimiento,
        permiso,
      );
      data.idProductor = establecimiento.idProductor;
      data.idDistribuidor = establecimiento.idDistribuidor;
      data.idQuimica = establecimiento.idQuimica;
    }

    return await this.repository.update(id, data);
  }

  async delete(idLote: string, permiso: IPermiso): Promise<ILote> {
    await this.getById(idLote, permiso);
    // Borro los reportes asociados al lote
    const filter: IFilter<IReporteNDVI> = {
      idLote,
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
    };
    await this.reportesNDVIsService.deleteMany(query, permiso);
    // Borro el lote
    return await this.repository.delete(idLote);
  }

  async calcularCapacidadCampo(idSonda: string, fecha: string) {
    return await this.repository.calcularCapacidadCampo(idSonda, fecha);
  }

  // Private

  private puedeVer(data: ILote, permiso: IPermiso): boolean {
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
    const filtro: IFilter<ILote> = HelperService.filtroToObject(query.filter);
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
