import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  IEstablecimiento,
  IListado,
  IQueryParam,
  ICreateEstablecimiento,
  IUpdateEstablecimiento,
  IFilter,
  IPermiso,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { EstablecimientosRepository } from './repository';
import { ClimaRepository } from '../clima/repository';
import { ProductorsService } from '../productor/service';

@Injectable()
export class EstablecimientosService {
  constructor(
    private repository: EstablecimientosRepository,
    private climaRepository: ClimaRepository,
    private productorsService: ProductorsService,
  ) {}

  async getById(id: string, permiso: IPermiso): Promise<IEstablecimiento> {
    const res = await this.repository.getById(id);
    if (!this.puedeVer(res, permiso)) {
      throw new BadRequestException(
        'No tiene permiso para ver este establecimiento',
      );
    }
    await Promise.all([this.checkPronostico(res), this.checkClima(res)]);
    return res;
  }

  async get(
    query: IQueryParam,
    permiso: IPermiso,
  ): Promise<IListado<IEstablecimiento>> {
    this.agregarFiltroPermiso(query, permiso);
    const res = await this.repository.get(query);
    await Promise.all(
      res.datos.map(async (est) => {
        await Promise.all([this.checkPronostico(est), this.checkClima(est)]);
      }),
    );
    return res;
  }

  async create(
    data: ICreateEstablecimiento,
    permiso: IPermiso,
  ): Promise<IEstablecimiento> {
    if (data.ubicacion?.length) {
      for (const u of data.ubicacion) {
        if (u.poligono?.length && !u.geojson) {
          u.geojson = {
            type: 'Polygon',
            coordinates: [HelperService.polyToGeojson(u.poligono)],
          };
        }
      }
    }
    if (!data.idProductor) {
      data.idProductor = permiso.idProductor;
    }
    const productor = await this.productorsService.getById(
      data.idProductor,
      permiso,
    );
    data.idDistribuidor = productor.idDistribuidor;
    data.idQuimica = productor.idQuimica;
    if (!this.puedeVer(data, permiso)) {
      throw new BadRequestException(
        'No tiene permiso para crear este establecimiento',
      );
    }
    return await this.repository.create(data);
  }

  async update(
    id: string,
    data: IUpdateEstablecimiento,
    permiso: IPermiso,
  ): Promise<IEstablecimiento> {
    await this.getById(id, permiso);
    if (data.ubicacion?.length) {
      for (const u of data.ubicacion) {
        if (u.poligono?.length) {
          u.geojson = {
            type: 'Polygon',
            coordinates: [HelperService.polyToGeojson(u.poligono)],
          };
        }
      }
    }
    if (!this.puedeVer(data, permiso)) {
      throw new BadRequestException(
        'No tiene permiso para actualizar este establecimiento',
      );
    }
    return await this.repository.update(id, data);
  }

  async delete(id: string, permiso: IPermiso): Promise<IEstablecimiento> {
    await this.getById(id, permiso);
    return await this.repository.delete(id);
  }

  // Private

  private async checkPronostico(est: IEstablecimiento) {
    try {
      const vencido = this.vencido(est.prediccionClimatica?.fecha, 2);
      const pronosticos = est.prediccionClimatica?.pronosticos;
      if (!pronosticos?.length || vencido) {
        const centro = est.ubicacion[0]?.centro;
        if (!centro?.lat || !centro?.lng) {
          Logger.error(
            'No se puede obtener el pronostico, lat o lng no definidos',
          );
          return;
        }
        const pronosticos = await this.climaRepository.getPronostico(
          centro.lat,
          centro.lng,
        );
        const fecha = new Date().toISOString();
        const prediccionClimatica = {
          fecha,
          pronosticos,
        };
        est.prediccionClimatica = prediccionClimatica || {};
        // update el pronostico en la base de datos
        await this.repository.update(est._id, {
          prediccionClimatica,
        });
      }
    } catch (error) {
      Logger.error('Error al obtener el pronostico climatologico');
      console.error(error);
    }
  }

  private async checkClima(est: IEstablecimiento) {
    try {
      const vencido = this.vencido(est.climaActual?.fecha, 1);
      const clima = est.climaActual?.clima;
      if (!clima || vencido) {
        const centro = est.ubicacion[0]?.centro;
        if (!centro?.lat || !centro?.lng) {
          Logger.error('No se puede obtener el clima, lat o lng no definidos');
          return;
        }
        const clima = await this.climaRepository.getClima(
          centro.lat,
          centro.lng,
        );
        const fecha = new Date().toISOString();
        const climaActual = {
          fecha,
          clima,
        };
        est.climaActual = climaActual || {};
        // update el pronostico en la base de datos
        await this.repository.update(est._id, {
          climaActual,
        });
      }
    } catch (error) {
      Logger.error('Error al obtener el clima actual');
      console.error(error);
    }
  }

  private vencido(fecha: string, horas: number): boolean {
    // True si la fecha es de hace una hora, false si más antigua
    if (!fecha) {
      return true;
    }
    const limite = horas ? horas * 60 * 60 * 1000 : 3600000; // Por defecto, 1 hora
    const fechaACheckear = new Date(fecha);
    const fechaActual = new Date();
    const diferencia = fechaActual.getTime() - fechaACheckear.getTime();
    return diferencia > limite;
  }

  // Permisos

  private puedeVer(data: IEstablecimiento, permiso: IPermiso): boolean {
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
      return !data._id || data._id === permiso.idEstablecimiento;
    }
    return false;
  }

  private agregarFiltroPermiso(query: IQueryParam, permiso: IPermiso) {
    const filtro: IFilter<IEstablecimiento> = HelperService.filtroToObject(
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
      $and.push({ _id: permiso.idEstablecimiento });
    }

    if ($and.length > 0) {
      filtro.$and = $and;
      query.filter = JSON.stringify(filtro);
    }
  }
}
