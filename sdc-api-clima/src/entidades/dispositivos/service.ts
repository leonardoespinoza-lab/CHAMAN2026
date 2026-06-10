import { Injectable, Logger } from '@nestjs/common';
import {
  IDispositivo,
  IListado,
  IQueryParam,
  ICreateDispositivo,
  IUpdateDispositivo,
  IFilter,
  ICoordenadas,
  SensoresV2,
} from 'modelos/src';
import { DispositivosRepository } from './repository';
import { HelperService } from 'src/auxiliares/helper';

export interface IDispositivoCercano extends IDispositivo {
  distancia?: number;
  actual?: boolean; // Que tiene un reporte actual.
}

@Injectable()
export class DispositivosService {
  private logger = new Logger(DispositivosService.name);
  constructor(private repository: DispositivosRepository) {}

  async getById(id: string): Promise<IDispositivo> {
    return await this.repository.getById(id);
  }

  async get(filtro: IQueryParam): Promise<IListado<IDispositivo>> {
    return await this.repository.get(filtro);
  }

  async create(data: ICreateDispositivo): Promise<IDispositivo> {
    return await this.repository.create(data);
  }

  async update(id: string, data: IUpdateDispositivo): Promise<IDispositivo> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<IDispositivo> {
    return await this.repository.delete(id);
  }

  public async getDispositivoCercano(data: {
    ubicacion: ICoordenadas;
    sensores: SensoresV2[];
    distancia?: number; // Distancia en kms
  }): Promise<IDispositivoCercano[]> {
    // Validación
    const ubicacion = data.ubicacion;
    if (!ubicacion) return;

    // Filtro por ubicación 20km
    const filter: IFilter<IDispositivo> = {
      sensores: { $all: data.sensores },
      geojson: {
        $geoWithin: {
          // $centerSphere: [[+ubicacion.lng, +ubicacion.lat], 0.15 / 6378.1], // 150 metros
          $centerSphere: [
            [+ubicacion.lng, +ubicacion.lat],
            data.distancia ? data.distancia : 1000 / 6378.1,
          ], // 1000 km
        },
      },
    };

    // Log
    this.logger.debug(
      `Filtro para estación con sensores: ${data.sensores} cercana: ${JSON.stringify(filter)}`,
    );

    // Query
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      limit: 0,
    };
    const result = await this.repository.get(query);
    const dispositivos = result.datos as IDispositivoCercano[];

    // this.logger.debug(`Estaciones encontradas: ${estaciones.length}`);

    // Agrega la distancia de la estacion a la ubicacion
    dispositivos.forEach((dispositivo) => {
      try {
        dispositivo.distancia = HelperService.distanciaDispositivoEnMetros(
          ubicacion,
          dispositivo,
        );
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        Logger.error(
          `Error al calcular distancia de estacion 
            ${dispositivo.nombre} 
            - ubicacion: ${JSON.stringify(dispositivo.geojson?.coordinates)}`,
        );
      }
    });

    // Ordenas las estaciones por distancia a la ubicacion
    dispositivos.sort((a, b) => {
      return a.distancia - b.distancia;
    });

    return dispositivos;
  }
}
