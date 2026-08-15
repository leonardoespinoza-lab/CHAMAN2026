import { Injectable } from '@nestjs/common';
import { ClimaV2Repository, IQueryClima } from './repository';
import {
  IClimaEstacionMeteorologica,
  IPronosticoEstacionMeteorologica,
} from 'modelos/src';

export type TCiclo = 'Corto' | 'Intermedio' | 'Largo';

@Injectable()
export class ClimaV2Service {
  constructor(private repository: ClimaV2Repository) {}

  async getClima(query: IQueryClima): Promise<IClimaEstacionMeteorologica[]> {
    return await this.repository.getClima(query);
  }

  async getSuelo(
    id: string,
    desde: string,
    hasta: string,
    agrupacion: 'hourly' | 'daily' = 'daily',
  ): Promise<IClimaEstacionMeteorologica[]> {
    return await this.repository.getSuelo(id, desde, hasta, agrupacion);
  }

  async getLluviaMasCercanaEntreFechas(
    lat: number,
    lng: number,
    from: string,
    to: string,
    dataGroup?: 'hourly' | 'daily',
  ): Promise<IClimaEstacionMeteorologica[]> {
    // Uso la query de getClima para obtener la lluvia
    const query: IQueryClima = {
      lat,
      lng,
      fechaDesde: from,
      fechaHasta: to,
      agrupacion: dataGroup || 'daily', // Agrupación diaria para lluvia
      sensores: ['pluviometro'], // Solo sensores de lluvia
    };
    return await this.repository.getClima(query);
  }

  async getPronostico(
    lat: number,
    lng: number,
    dias?: number,
  ): Promise<IPronosticoEstacionMeteorologica[]> {
    return await this.repository.getPronostico(lat, lng, dias);
  }
}
