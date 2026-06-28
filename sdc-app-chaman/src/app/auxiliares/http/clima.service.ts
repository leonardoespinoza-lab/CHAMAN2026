import { Injectable } from '@angular/core';
import { IFrioTermicoCultivo, IResumenRiesgosAgroclimaticos } from 'modelos/src';
import { HttpService } from './http.service';

export interface IClimaTile {
  x: number;
  y: number;
  z: number;
  data: string; // Base64 encoded image data
  fromCache: boolean;
  downloadTimeMs?: number;
}

export interface IClimaBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface IClimaResponse {
  success: boolean;
  message: string;
  variable: string;
  datetime: string;
  zoom: number;
  establecimientosCount: number;
  bounds: IClimaBounds;
  tiles: IClimaTile[];
  totalTiles: number;
  cacheStats: {
    hits: number;
    misses: number;
  };
}

export interface IClimaVariable {
  id: string;
  name: string;
  units: string;
  description: string;
}

@Injectable({
  providedIn: 'root',
})
export class ClimaService {
  constructor(private httpService: HttpService) {}

  /**
   * Obtiene un tile climático individual usando coordenadas XYZ
   * Compatible con el sistema estándar de OpenLayers
   * @param variable Variable climática (temperature, humidity, precipitation, etc.)
   * @param z Nivel de zoom del tile
   * @param x Coordenada X del tile
   * @param y Coordenada Y del tile
   * @returns Promise con la URL de datos del tile (data:image/png;base64,...)
   */
  async getSingleTile(variable: string, z: number, x: number, y: number): Promise<string> {
    const url = `/clima/tile/${variable}/${z}/${x}/${y}`;

    try {
      // Solicitar como blob para manejar imagen binaria
      const response = (await this.httpService.get(url, { responseType: 'blob' })) as Blob;

      // Convertir blob a data URL
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(response);
      });
    } catch (error) {
      console.error(`Error obteniendo tile ${variable}/${z}/${x}/${y}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene tiles de clima para todos los establecimientos del usuario
   * @param variable Variable climática (temperature, humidity, precipitation, etc.)
   * @param zoom Nivel de zoom para los tiles (default: 8)
   * @returns Promise con la respuesta que incluye múltiples tiles
   */
  getTiles(variable: string, zoom: number = 8): Promise<IClimaResponse> {
    const url = `/clima/tiles/${variable}`;
    const params = { zoom: zoom.toString() };

    return this.httpService.get<IClimaResponse>(url, { params });
  }

  getFrioTermico(
    lat: number,
    lng: number,
    params: {
      cultivo?: string;
      horasFrioObjetivo?: number;
      horasFrioEfectivasObjetivo?: number;
      porcionesFrioObjetivo?: number;
      temperaturaBaseGradosDia?: number;
      gradosDiaBrotacionObjetivo?: number;
      gradosDiaFloracionObjetivo?: number;
    } = {}
  ): Promise<IFrioTermicoCultivo> {
    const query = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
    ) as Record<string, string | number | boolean>;
    return this.httpService.get<IFrioTermicoCultivo>(`/clima/frio-termico/${lat}/${lng}`, { params: query });
  }

  getRiesgosAgroclimaticos(
    lat: number,
    lng: number,
    params: {
      cultivo?: string;
      variedad?: string;
      fechaSiembra?: string;
      etapaFenologica?: string;
    } = {}
  ): Promise<IResumenRiesgosAgroclimaticos> {
    const query = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
    ) as Record<string, string | number | boolean>;
    return this.httpService.get<IResumenRiesgosAgroclimaticos>(`/clima/riesgos-agroclimaticos/${lat}/${lng}`, {
      params: query,
    });
  }

  /**
   * Obtiene tiles de clima para múltiples niveles de zoom
   * @param variable Variable climática (temperature, humidity, precipitation, etc.)
   * @param zoomLevels Array de niveles de zoom para los tiles (default: [8, 12, 14])
   * @returns Promise con múltiples respuestas, una por cada nivel de zoom
   */
  async getTilesMultipleZooms(variable: string, zoomLevels: number[] = [8, 12, 14]): Promise<IClimaResponse[]> {
    const promises = zoomLevels.map((zoom) => this.getTiles(variable, zoom));
    return Promise.all(promises);
  }

  /**
   * Obtiene las variables climáticas disponibles
   * Basado en las variables soportadas por el backend
   * @returns Promise con la lista de variables disponibles
   */
  getAvailableVariables(): Promise<IClimaVariable[]> {
    // Variables disponibles según el controller del backend
    const variables: IClimaVariable[] = [
      {
        id: 'temperature',
        name: 'Temperatura',
        units: '°C',
        description: 'Temperatura del aire a 2 metros de altura',
      },
      {
        id: 'humidity',
        name: 'Humedad Relativa',
        units: '%',
        description: 'Humedad relativa del aire',
      },
      {
        id: 'precipitation',
        name: 'Precipitación',
        units: 'mm',
        description: 'Precipitación acumulada',
      },
      {
        id: 'wind_speed',
        name: 'Velocidad del Viento',
        units: 'm/s',
        description: 'Velocidad del viento a 10 metros de altura',
      },
      {
        id: 'pressure',
        name: 'Presión Atmosférica',
        units: 'hPa',
        description: 'Presión atmosférica a nivel del mar',
      },
      {
        id: 'clouds',
        name: 'Nubosidad',
        units: '%',
        description: 'Porcentaje de cobertura de nubes',
      },
    ];

    return Promise.resolve(variables);
  }
}
