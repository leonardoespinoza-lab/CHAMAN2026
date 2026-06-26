import { Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { API_METEO_SOURCE, METEO_SOURCE_KEY } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import {
  IForecastMeteoSource,
  ITimeMachineMeteoSource,
} from './modelos/modelos';
import { ICoordenadas, WeatherVariable } from 'modelos/src';

const execFileAsync = promisify(execFile);

export interface Token {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
  expires_at: number;
}

@Injectable()
export class MeteoSourceRepository {
  constructor(private axios: AxiosService) {}

  async getForecast(
    ubicacion: ICoordenadas,
    agrupacion: 'hourly' | 'daily' | 'hourly,daily' = 'daily',
  ): Promise<IForecastMeteoSource> {
    const sections = agrupacion;
    const url = `/standard/point?lat=${ubicacion.lat}&lon=${ubicacion.lng}&sections=${sections}&timezone=UTC&language=en&units=metric&key=${METEO_SOURCE_KEY}`;
    return await this.axios.GETWithRetry(`${API_METEO_SOURCE}${url}`);
  }

  async getHistorico(
    ubicacion: ICoordenadas,
    dia: string, // formato YYYY-MM-DD
  ): Promise<ITimeMachineMeteoSource> {
    const url = `/standard/time_machine?lat=${ubicacion.lat}&lon=${ubicacion.lng}&date=${dia}&timezone=UTC&language=en&units=metric&key=${METEO_SOURCE_KEY}`;
    return await this.axios.GETWithRetry(`${API_METEO_SOURCE}${url}`);
  }

  async getCurrentWeather(
    ubicacion: ICoordenadas,
  ): Promise<IForecastMeteoSource> {
    const url = `/standard/point?lat=${ubicacion.lat}&lon=${ubicacion.lng}&sections=current&timezone=UTC&language=en&units=metric&key=${METEO_SOURCE_KEY}`;
    return await this.axios.GETWithRetry(`${API_METEO_SOURCE}${url}`);
  }

  async checkApi() {
    const url = `/standard/point?lat=40.4168&lon=-3.7038&sections=hourly,daily&timezone=UTC&language=en&units=metric&key=${METEO_SOURCE_KEY}`;
    return await this.axios.GETWithRetry(`${API_METEO_SOURCE}${url}`);
  }

  /**
   * Obtiene un tile de mapa climático de Meteosource
   * @param variable Variable climática (temperature, precipitation, clouds, wind_speed, humidity, pressure, etc.)
   * @param datetime Momento temporal (now, +1hours, +2hours, YYYY-MM-DDTHH:MM)
   * @param x Coordenada X del tile (Google Maps tile notation)
   * @param y Coordenada Y del tile (Google Maps tile notation)
   * @param z Nivel de zoom del tile (Google Maps tile notation)
   * @returns Buffer con la imagen PNG del tile
   */
  async getTile(
    variable: WeatherVariable,
    datetime: string,
    x: string,
    y: string,
    z: string,
  ): Promise<Buffer> {
    if (!METEO_SOURCE_KEY) {
      throw new Error('METEO_SOURCE_KEY no configurada');
    }

    const tileUrl = `${API_METEO_SOURCE}/standard/map?tile_x=${x}&tile_y=${y}&tile_zoom=${z}&variable=${variable}&datetime=${datetime}&format=png&key=${METEO_SOURCE_KEY}`;

    // Usar curl en lugar de axios/Node.js HTTPS para evitar el bloqueo de JA3
    // que aplica Meteosource al TLS fingerprint de Node.js/OpenSSL3
    try {
      const { stdout } = await execFileAsync(
        'curl',
        ['-s', '--max-time', '10', '--output', '-', tileUrl],
        { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 },
      );

      const buffer = Buffer.from(stdout);
      console.log(`✅ Tile ${variable} [${x},${y},${z}] recibido: ${buffer.length} bytes`);
      return buffer;
    } catch (error) {
      console.error(`❌ Error obteniendo tile de Meteosource [${x},${y},${z}]:`, error.message);
      return this.getTileConFetch(tileUrl, variable, x, y, z);
    }
  }

  private async getTileConFetch(
    tileUrl: string,
    variable: WeatherVariable,
    x: string,
    y: string,
    z: string,
  ): Promise<Buffer> {
    const response = await fetch(tileUrl);
    if (!response.ok) {
      throw new Error(
        `Meteosource tile respondio ${response.status} [${x},${y},${z}]`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(
      `Tile ${variable} [${x},${y},${z}] recibido via fetch: ${buffer.length} bytes`,
    );
    return buffer;
  }
}
