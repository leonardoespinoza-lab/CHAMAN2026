import { Injectable } from '@nestjs/common';
import {
  IEstacion,
  ICreateEstacion,
  IListado,
  IQueryParam,
  IUpdateEstacion,
  ICoordenadas,
  IFilter,
} from 'modelos/src';
import { EstacionsRepository } from './repository';
import { HelperService } from '../../auxiliares/helper';
import { LogService } from '../../auxiliares/logsService/service';

export interface IEstacionCercana extends IEstacion {
  distancia?: number;
}

export type StationMetaKeys =
  | 'solarRadiation'
  | 'soilTemp'
  | 'solarPanel'
  | 'battery'
  | 'airTemp'
  | 'rh'
  | 'rain7d'
  | 'rain48h'
  | 'rain24h'
  | 'volumetricAverage';

@Injectable()
export class EstacionsService {
  private logger = new LogService(EstacionsService.name);

  constructor(private repository: EstacionsRepository) {}

  async getById(id: string): Promise<IEstacion> {
    return await this.repository.getById(id);
  }

  async getFiltered(query: IQueryParam): Promise<IListado<IEstacion>> {
    return await this.repository.getFiltered(query);
  }

  async create(data: ICreateEstacion): Promise<IEstacion> {
    return await this.repository.create(data);
  }

  async update(id: string, data: IUpdateEstacion): Promise<IEstacion> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IEstacion> {
    return await this.repository.delete(id);
  }

  //

  async getSueloFiltered(query: IQueryParam): Promise<IListado<IEstacion>> {
    this.agregarFiltroSuelo(query);
    return await this.repository.getFiltered(query);
  }

  private async getCercana(data: {
    ubicacion: ICoordenadas;
    sensores?: StationMetaKeys[];
    minDate?: string;
    maxDate?: string;
    tipo?: 'lluvia' | 'clima' | 'suelo';
    distancia?: number;
  }): Promise<IEstacionCercana[]> {
    // Validación
    const ubicacion = data.ubicacion;
    if (!ubicacion) return;
    const distancia = data.distancia || 2000; // 2000 km

    // Filtro por ubicación 20km
    const filter: IFilter<IEstacion> = {
      'position.geo': {
        $geoWithin: {
          $centerSphere: [[+ubicacion.lng, +ubicacion.lat], distancia / 6378.1],
        },
      },
    } as any;

    // Filtro por sensores
    const sensores = data.sensores;
    if (sensores?.length) {
      for (const sensor of sensores) {
        filter[`meta.${sensor}`] = { $exists: true };
      }
    }

    // Filtro por fechas
    const minDate = data.minDate;
    const maxDate = data.maxDate;
    if (minDate) {
      filter[`dates.min_date`] = { $lte: minDate };
    }
    if (maxDate) {
      const hoy = new Date();
      const max = new Date(maxDate);
      const diaHoy = hoy.toISOString().split('T')[0];
      const diaMax = max.toISOString().split('T')[0];
      if (max < hoy && diaHoy !== diaMax) {
        filter[`dates.max_date`] = { $gte: maxDate };
      }
    }

    // Log
    this.logger.debug(
      `Filtro para estación de ${data.tipo} cercana: ${JSON.stringify(filter)}`,
    );

    // Query
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      limit: 0,
    };
    const result = await this.repository.getFiltered(query);
    const estaciones = result.datos as IEstacionCercana[];

    // this.logger.debug(`Estaciones encontradas: ${estaciones.length}`);

    // Agrega la distancia de la estacion a la ubicacion
    estaciones.forEach((estacion) => {
      try {
        estacion.distancia = HelperService.distanciaEstacionEnMetros(
          ubicacion,
          estacion,
        );
      } catch (error) {
        this.logger.error(
          `Error al calcular distancia de estacion
          ${estacion.idExterno}
          - ubicacion: ${JSON.stringify(estacion.position?.geo?.coordinates)}`,
        );
      }
    });

    // Ordenas las estaciones por distancia a la ubicacion
    estaciones.sort((a, b) => {
      return a.distancia - b.distancia;
    });

    return estaciones;
  }

  private async getEstacionPorSensores(data: {
    sensores?: StationMetaKeys[];
    minDate?: string;
    maxDate?: string;
    tipo?: 'lluvia' | 'clima' | 'suelo';
  }): Promise<IEstacionCercana> {
    const filter: IFilter<IEstacion> = {};

    // Filtro por sensores
    const sensores = data.sensores;
    if (sensores?.length) {
      for (const sensor of sensores) {
        filter[`meta.${sensor}`] = { $exists: true };
      }
    }

    // Filtro por fechas
    const minDate = data.minDate;
    const maxDate = data.maxDate;
    if (minDate) {
      filter[`dates.min_date`] = { $lte: minDate };
    }
    if (maxDate) {
      const hoy = new Date();
      const max = new Date(maxDate);
      const diaHoy = hoy.toISOString().split('T')[0];
      const diaMax = max.toISOString().split('T')[0];
      if (max < hoy && diaHoy !== diaMax) {
        filter[`dates.max_date`] = { $gte: maxDate };
      }
    }

    // Log
    this.logger.debug(
      `Filtro para estación de ${data.tipo} cercana: ${JSON.stringify(filter)}`,
    );

    // Query
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      limit: 1,
    };
    const result = await this.repository.getFiltered(query);
    const estaciones = result.datos as IEstacionCercana[];

    return estaciones[0];
  }

  async getEstacionSueloCerca(data: {
    ubicacion: ICoordenadas;
    minDate?: string;
    maxDate?: string;
  }): Promise<IEstacionCercana[]> {
    const estaciones = await this.getCercana({
      ubicacion: data.ubicacion,
      sensores: ['soilTemp', 'volumetricAverage'],
      minDate: data.minDate,
      maxDate: data.maxDate,
      tipo: 'suelo',
    });
    return estaciones;
  }

  async getEstacionSueloRandom(): Promise<IEstacionCercana> {
    const estacion = await this.getEstacionPorSensores({
      sensores: ['soilTemp', 'volumetricAverage'],
      tipo: 'suelo',
    });
    return estacion;
  }

  // Private
  private agregarFiltroSuelo(query: IQueryParam): void {
    const filter = HelperService.filtroToObject(query.filtro);
    filter[`meta.soilTemp`] = { $exists: true };
    filter[`meta.volumetricAverage`] = { $exists: true };
    query.filtro = JSON.stringify(filter);
  }
}
