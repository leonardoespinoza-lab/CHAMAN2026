import { Injectable, Logger } from '@nestjs/common';
import { ICoordenadas } from '../../auxiliares/helper';
import { IStationData } from './modelos/stationData';
import { FieldClimateRepository } from './repository';
import { IEstacion } from 'modelos/src';
import { EstacionsService, IEstacionCercana } from '../estacion/service';
import { FIELD_CLIMATE_PASS, FIELD_CLIMATE_USERS } from 'src/env';
import { revealFieldClimateCredential } from '../../auxiliares/fieldclimate-credentials';

@Injectable()
export class FieldClimateService {
  constructor(
    private repository: FieldClimateRepository,
    private estacion: EstacionsService,
  ) {}

  private credenciales(username: string, password: string) {
    return {
      username: revealFieldClimateCredential(username),
      password: revealFieldClimateCredential(password),
    };
  }

  private getFechaQuery(fecha: number): number {
    const date = new Date(fecha);
    date.setHours(date.getHours() - 3);
    return Math.trunc(date.getTime());
  }

  async systemStatus(username: string, password: string) {
    const credentials = this.credenciales(username, password);
    return await this.repository.systemStatus(
      credentials.username,
      credentials.password,
    );
  }

  async getSystemTypes(username: string, password: string) {
    const credentials = this.credenciales(username, password);
    return await this.repository.getSystemTypes(
      credentials.username,
      credentials.password,
    );
  }

  async getStations(username: string, password: string) {
    const credentials = this.credenciales(username, password);
    return await this.repository.getStations(
      credentials.username,
      credentials.password,
    );
  }

  async getStation(id: string, username: string, password: string) {
    const credentials = this.credenciales(username, password);
    return await this.repository.getStation(
      id,
      credentials.username,
      credentials.password,
    );
  }

  async getStationSensors(id: string, username: string, password: string) {
    const credentials = this.credenciales(username, password);
    return await this.repository.getStationSensors(
      id,
      credentials.username,
      credentials.password,
    );
  }

  async getLicenses(username: string, password: string) {
    const credentials = this.credenciales(username, password);
    return await this.repository.getLicenses(
      credentials.username,
      credentials.password,
    );
  }

  async getMinMaxTimeData(
    stationId: string,
    username: string,
    password: string,
  ) {
    const credentials = this.credenciales(username, password);
    return await this.repository.getMinMaxTimeData(
      stationId,
      credentials.username,
      credentials.password,
    );
  }

  /**
   *
   * @param stationId
   * @param dataGroup
   * @param startDate Recibe la fecha en ISO y la convierte a -3 (AR)
   * @param endDate  Recibe la fecha en ISO y la convierte a -3 (AR)
   * @param username
   * @param password
   * @returns
   */
  async getDataBetweenDates(
    stationId: string,
    dataGroup: 'raw' | 'hourly' | 'daily' | 'monthly',
    startDate: number,
    endDate: number,
    username: string,
    password: string,
  ) {
    const from = this.getFechaQuery(startDate);
    const to = this.getFechaQuery(endDate);

    const credentials = this.credenciales(username, password);
    return await this.repository.getDataBetweenDates(
      stationId,
      dataGroup,
      from,
      to,
      credentials.username,
      credentials.password,
    );
  }

  async getLastData(
    stationId: string,
    dataGroup: 'raw' | 'hourly' | 'daily' | 'monthly',
    timePeriod: string,
    username: string,
    password: string,
  ) {
    const credentials = this.credenciales(username, password);
    return await this.repository.getLastData(
      stationId,
      dataGroup,
      timePeriod,
      credentials.username,
      credentials.password,
    );
  }

  async getForecast(stationId: string, username: string, password: string) {
    const credentials = this.credenciales(username, password);
    return await this.repository.getForecast(
      stationId,
      credentials.username,
      credentials.password,
    );
  }

  // Custom

  async getEstacionMasCercanaEntreFechas(
    ubicacion: ICoordenadas,
    minDate: string,
    maxDate: string,
    dataGroup: 'raw' | 'hourly' | 'daily' | 'monthly' = 'daily',
  ): Promise<{ station: IEstacion; data: IStationData }> {
    const estaciones = await this.estacion.getEstacionLluvia({
      ubicacion,
      minDate,
      maxDate,
    });

    for (const station of estaciones) {
      const stationId = station.idExterno;
      const data = await this.getDataBetweenDates(
        stationId,
        dataGroup,
        new Date(minDate).getTime(),
        new Date(maxDate).getTime(),
        station.user,
        station.pass,
      );
      if (data?.dates?.length) {
        return { station, data };
      }
      const distKM = Math.trunc(station.distancia / 1000);
      Logger.debug(
        `Estacion: ${station.name.custom} (${station.idExterno}) a ${distKM} km, no tiene datos entre ${minDate} y ${maxDate}`,
      );
    }
  }

  async getPluviometroMasCercanoEntreFechas(
    ubicacion: ICoordenadas,
    minDate: string,
    maxDate: string,
    dataGroup: 'raw' | 'hourly' | 'daily' | 'monthly' = 'daily',
  ): Promise<{ station: IEstacionCercana; data: IStationData }> {
    const estaciones = await this.estacion.getEstacionLluvia({
      ubicacion,
      minDate,
      maxDate,
    });

    for (const station of estaciones) {
      const stationId = station.idExterno;
      const data = await this.getDataBetweenDates(
        stationId,
        dataGroup,
        new Date(minDate).getTime(),
        new Date(maxDate).getTime(),
        station.user,
        station.pass,
      );
      if (data?.dates?.length) {
        return { station, data };
      }
      const distKM = Math.trunc(station.distancia / 1000);
      Logger.debug(
        `Pluviometro: ${station.name.custom} (${station.idExterno}) a ${distKM} km, no tiene datos entre ${minDate} y ${maxDate}`,
      );
    }
  }

  async getSueloMasCercanoEntreFechas(
    ubicacion: ICoordenadas,
    minDate: string,
    maxDate: string,
    dataGroup: 'raw' | 'hourly' | 'daily' | 'monthly' = 'daily',
  ): Promise<{ station: IEstacionCercana; data: IStationData }> {
    const estaciones = await this.estacion.getEstacionSuelo({
      ubicacion,
      minDate,
      maxDate,
    });

    for (const station of estaciones) {
      const stationId = station.idExterno;
      const data = await this.getDataBetweenDates(
        stationId,
        dataGroup,
        new Date(minDate).getTime(),
        new Date(maxDate).getTime(),
        station.user,
        station.pass,
      );
      if (data?.dates?.length) {
        return { station, data };
      }
      const distKM = Math.trunc(station.distancia / 1000);
      Logger.debug(
        `Sensor suelo: ${station.name.custom} (${station.idExterno}) a ${distKM} km, no tiene datos entre ${minDate} y ${maxDate}`,
      );
    }
  }

  // ApiCheck

  async checkApi() {
    const user = FIELD_CLIMATE_USERS[0];
    const pass = FIELD_CLIMATE_PASS[0];
    await this.systemStatus(user, pass);
  }
}
