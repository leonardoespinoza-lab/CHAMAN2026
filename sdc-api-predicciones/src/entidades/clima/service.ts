import { Injectable } from '@nestjs/common';
import { ClimaRepository } from './repository';
import {
  IClimaEstacionMeteorologica,
  IEstablecimiento,
} from 'modelos/src';

export type TCiclo = 'Corto' | 'Intermedio' | 'Largo';

@Injectable()
export class ClimaService {
  constructor(private repository: ClimaRepository) {}

  async getEstacionMasCercanaEntreFechas(
    lat: number,
    lng: number,
    from: string,
    to: string,
    dataGroup?: 'raw' | 'hourly' | 'daily' | 'monthly',
    establecimiento?: Pick<
      IEstablecimiento,
      'idEstacionMeteorologica' | 'fuenteClimaPreferida'
    >,
  ): Promise<IClimaEstacionMeteorologica[]> {
    const idEstacionMeteorologica =
      establecimiento?.fuenteClimaPreferida === 'Open-Meteo'
        ? undefined
        : establecimiento?.idEstacionMeteorologica;
    return await this.repository.getEstacionMasCercanaEntreFechas(
      lat,
      lng,
      from,
      to,
      dataGroup,
      idEstacionMeteorologica,
    );
  }

  async getPluviometroMasCercanaEntreFechas(
    lat: number,
    lng: number,
    from: string,
    to: string,
    dataGroup?: 'raw' | 'hourly' | 'daily' | 'monthly',
  ): Promise<IClimaEstacionMeteorologica[]> {
    return await this.repository.getPluviometroMasCercanaEntreFechas(
      lat,
      lng,
      from,
      to,
      dataGroup,
    );
  }

  async getSueloMasCercanaEntreFechas(
    lat: number,
    lng: number,
    from: string,
    to: string,
  ): Promise<IClimaEstacionMeteorologica[]> {
    return await this.repository.getSueloMasCercanaEntreFechas(
      lat,
      lng,
      from,
      to,
    );
  }

  async getClimaMasCercanaEntreFechas(
    lat: number,
    lng: number,
    from: string,
    to: string,
  ) {
    return await this.repository.getClimaMasCercanaEntreFechas(
      lat,
      lng,
      from,
      to,
    );
  }

  async getPronosticoMasCercano(lat: number, lng: number) {
    return await this.repository.getPronosticoMasCercano(lat, lng);
  }

  async getSueloPorDispositivoEntreFechas(
    id: string,
    from: string,
    to: string,
  ) {
    return await this.repository.getSueloPorDispositivoEntreFechas(
      id,
      from,
      to,
    );
  }

  // async getSueloPorDispositivo(id: string) {
  //   return await this.repository.getSueloPorDispositivoEntreFechas(
  //     id,
  //     from,
  //     to,
  //   );
  // }
}
