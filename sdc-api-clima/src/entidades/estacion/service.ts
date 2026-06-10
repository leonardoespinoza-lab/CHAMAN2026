import { Injectable, Logger } from '@nestjs/common';
import {
  ICoordenadas,
  IEstacion,
  IFilter,
  IListado,
  IQueryParam,
  Sensores,
} from 'modelos/src';
import { EstacionsRepository } from './repository';
import { StationMetaKeys } from '../fieldClimate/modelos/station';
import { LogService } from '../../auxiliares/logsService/service';
import { HelperService } from '../../auxiliares/helper';

export interface IEstacionCercana extends IEstacion {
  distancia?: number;
  actual?: boolean; // Que tiene un reporte actual
}

@Injectable()
export class EstacionsService {
  private logger = new LogService(EstacionsService.name);
  constructor(private repository: EstacionsRepository) {}

  async getById(id: string): Promise<IEstacion> {
    return await this.repository.getById(id);
  }

  async getFiltered(filtro: IQueryParam): Promise<IListado<IEstacion>> {
    return await this.repository.getFiltered(filtro);
  }

  async upsertMany(estaciones: IEstacion[]): Promise<void> {
    await this.repository.upsertMany(estaciones);
  }

  public async getCercana2(data: {
    ubicacion: ICoordenadas;
    sensores: Sensores[];
    minDate?: string;
    maxDate?: string;
    distancia?: number; // Distancia en kms
  }): Promise<IEstacionCercana[]> {
    // Validación
    const ubicacion = data.ubicacion;
    if (!ubicacion) return;

    // Filtro por ubicación 20km
    const filter: IFilter<IEstacion> = {
      sensores: { $all: data.sensores },
      'position.geo': {
        $geoWithin: {
          // $centerSphere: [[+ubicacion.lng, +ubicacion.lat], 0.15 / 6378.1], // 150 metros
          $centerSphere: [
            [+ubicacion.lng, +ubicacion.lat],
            data.distancia ? data.distancia : 1000 / 6378.1,
          ], // 1000 km
        },
      },
    } as any;

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
      `Filtro para estación con sensores: ${data.sensores} cercana: ${JSON.stringify(filter)}`,
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        Logger.error(
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

  private async getCercana(data: {
    ubicacion: ICoordenadas;
    sensores?: StationMetaKeys[];
    minDate?: string;
    maxDate?: string;
    tipo?: 'lluvia' | 'clima' | 'suelo';
  }): Promise<IEstacionCercana[]> {
    // Validación
    const ubicacion = data.ubicacion;
    if (!ubicacion) return;

    // Filtro por ubicación 20km
    const filter: IFilter<IEstacion> = {
      'position.geo': {
        $geoWithin: {
          // $centerSphere: [[+ubicacion.lng, +ubicacion.lat], 0.15 / 6378.1], // 150 metros
          $centerSphere: [[+ubicacion.lng, +ubicacion.lat], 1000 / 6378.1], // 1000 km
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        Logger.error(
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

  async getEstacionLluvia(data: {
    ubicacion: ICoordenadas;
    minDate?: string;
    maxDate?: string;
  }): Promise<IEstacionCercana[]> {
    const estaciones = await this.getCercana({
      ubicacion: data.ubicacion,
      sensores: ['rain7d'],
      minDate: data.minDate,
      maxDate: data.maxDate,
      tipo: 'lluvia',
    });
    return estaciones;
  }

  async getEstacionClima(data: {
    ubicacion: ICoordenadas;
    minDate?: string;
    maxDate?: string;
  }): Promise<IEstacionCercana[]> {
    const estaciones = await this.getCercana({
      ubicacion: data.ubicacion,
      sensores: ['airTemp', 'rh', 'rain7d'],
      minDate: data.minDate,
      maxDate: data.maxDate,
      tipo: 'clima',
    });
    return estaciones;
  }

  async getEstacionSuelo(data: {
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
}
