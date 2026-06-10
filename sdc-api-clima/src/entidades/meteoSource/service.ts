import { Injectable } from '@nestjs/common';
import { MeteoSourceRepository } from './repository';
import { ICoordenadas, WeatherVariable } from 'modelos/src';
import {
  IForecastMeteoSource,
  ITimeMachineMeteoSource,
} from './modelos/modelos';
import { RateLimiterService } from '../../auxiliares/rate-limiter/rate-limiter.service';

@Injectable()
export class MeteoSourceService {
  constructor(
    private repository: MeteoSourceRepository,
    private rateLimiter: RateLimiterService,
  ) {}

  async getForecast(
    ubicacion: ICoordenadas,
    agrupacion: 'hourly' | 'daily' | 'hourly,daily' = 'daily',
  ): Promise<IForecastMeteoSource> {
    return await this.rateLimiter.addClimateRequest(
      () => this.repository.getForecast(ubicacion, agrupacion),
      ubicacion.lat,
      ubicacion.lng,
    );
  }

  /**
   * Devuelve el clima horario del día indicado. (Hasta una año atrás)
   * @param ubicacion
   * @param dia YYYY-MM-DD
   */
  async getHistorico(
    ubicacion: ICoordenadas,
    dia: string,
  ): Promise<ITimeMachineMeteoSource> {
    return await this.rateLimiter.addClimateRequest(
      () => this.repository.getHistorico(ubicacion, dia),
      ubicacion.lat,
      ubicacion.lng,
    );
  }

  async getCurrentWeather(
    ubicacion: ICoordenadas,
  ): Promise<IForecastMeteoSource> {
    return await this.rateLimiter.addClimateRequest(
      () => this.repository.getCurrentWeather(ubicacion),
      ubicacion.lat,
      ubicacion.lng,
    );
  }

  async checkApi() {
    return await this.rateLimiter.add(
      () => this.repository.checkApi(),
      10, // Baja prioridad para health checks
      'API Health Check',
    );
  }

  /**
   * Obtiene un tile de mapa climático de Meteosource
   * @param variable Variable climática (temperature, precipitation, clouds, wind_speed, etc.)
   * @param datetime Momento temporal (now, +1hours, +2hours, YYYY-MM-DDTHH:MM)
   * @param x Coordenada X del tile
   * @param y Coordenada Y del tile
   * @param z Nivel de zoom del tile
   * @returns Buffer con la imagen PNG del tile
   */
  async getTile(
    variable: WeatherVariable,
    datetime: string,
    x: string,
    y: string,
    z: string,
  ): Promise<Buffer> {
    return await this.rateLimiter.addTileRequest(
      () => this.repository.getTile(variable, datetime, x, y, z),
      variable,
      { x: parseInt(x), y: parseInt(y), z: parseInt(z) },
    );
  }
}
