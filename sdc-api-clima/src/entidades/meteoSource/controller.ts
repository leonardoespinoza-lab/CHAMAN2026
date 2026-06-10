import {
  Controller,
  Get,
  Param,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { MeteoSourceService } from './service';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { WeatherVariable, WeatherVariableMetadata } from 'modelos/src';

/**
 * Metadatos completos de todas las variables climáticas disponibles
 */
const WEATHER_VARIABLES_METADATA: Record<
  WeatherVariable,
  WeatherVariableMetadata
> = {
  temperature: {
    name: 'Temperatura',
    unit: '°C',
    description: 'Temperatura del aire a 2 metros de altura',
    colorScale: 'temperature',
  },
  precipitation: {
    name: 'Precipitación',
    unit: 'mm',
    description: 'Precipitación acumulada',
    colorScale: 'precipitation',
  },
  clouds: {
    name: 'Nubosidad',
    unit: '%',
    description: 'Cobertura de nubes total',
    colorScale: 'clouds',
  },
  wind_speed: {
    name: 'Velocidad del viento',
    unit: 'm/s',
    description: 'Velocidad del viento a 10 metros de altura',
    colorScale: 'wind',
  },
  humidity: {
    name: 'Humedad relativa',
    unit: '%',
    description: 'Humedad relativa del aire',
    colorScale: 'humidity',
  },
  pressure: {
    name: 'Presión atmosférica',
    unit: 'hPa',
    description: 'Presión atmosférica a nivel del mar',
    colorScale: 'pressure',
  },
  visibility: {
    name: 'Visibilidad',
    unit: 'km',
    description: 'Visibilidad horizontal',
    colorScale: 'visibility',
  },
  gust: {
    name: 'Ráfagas de viento',
    unit: 'm/s',
    description: 'Velocidad máxima de ráfagas de viento',
    colorScale: 'wind',
  },
  wind_direction: {
    name: 'Dirección del viento',
    unit: '°',
    description: 'Dirección del viento en grados (0° = Norte)',
    colorScale: 'wind_direction',
  },
  uv_index: {
    name: 'Índice UV',
    unit: '',
    description: 'Índice de radiación ultravioleta',
    colorScale: 'uv',
  },
  dew_point: {
    name: 'Punto de rocío',
    unit: '°C',
    description: 'Temperatura del punto de rocío',
    colorScale: 'temperature',
  },
  sunshine: {
    name: 'Duración del sol',
    unit: 'min',
    description: 'Duración de la luz solar directa',
    colorScale: 'sunshine',
  },
  global_radiation: {
    name: 'Radiación global',
    unit: 'W/m²',
    description: 'Radiación solar global',
    colorScale: 'radiation',
  },
  diffuse_radiation: {
    name: 'Radiación difusa',
    unit: 'W/m²',
    description: 'Radiación solar difusa',
    colorScale: 'radiation',
  },
  cape: {
    name: 'CAPE',
    unit: 'J/kg',
    description: 'Energía potencial convectiva disponible',
    colorScale: 'cape',
  },
  lifted_index: {
    name: 'Índice de elevación',
    unit: '°C',
    description: 'Índice de estabilidad atmosférica',
    colorScale: 'stability',
  },
};

@ApiTags('Meteo Source')
@Controller('meteoSource')
export class MeteoSourceController {
  constructor(private service: MeteoSourceService) {}

  @Get(':lat/:lng') // /:fechaDesde/:fechaHasta')
  public async getForecast(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
  ) {
    return await this.service.getForecast({ lat, lng }, 'daily');
  }

  /**
   * Obtiene la lista de variables climáticas disponibles para tiles
   */
  @Get('tiles/variables')
  @ApiOperation({
    summary: 'Obtener variables climáticas disponibles',
    description:
      'Devuelve la lista de variables climáticas disponibles para generar tiles',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de variables disponibles',
  })
  public getAvailableVariables() {
    return WEATHER_VARIABLES_METADATA;
  }

  /**
   * Obtiene un tile de mapa climático de Meteosource en formato PNG
   * @param variable Variable climática (temperature, precipitation, clouds, wind_speed, etc.)
   * @param datetime Momento temporal (now, +1hours, +2hours, YYYY-MM-DDTHH:MM)
   * @param x Coordenada X del tile (Google Maps tile notation)
   * @param y Coordenada Y del tile (Google Maps tile notation)
   * @param z Nivel de zoom del tile (Google Maps tile notation)
   * @param res Response objeto para enviar datos binarios
   */
  @Get('tiles/:variable/:datetime/:x/:y/:z')
  @ApiOperation({
    summary: 'Obtener tile de mapa climático',
    description:
      'Devuelve un tile PNG con datos climáticos de Meteosource para una variable, tiempo y posición específicos',
  })
  @ApiParam({
    name: 'variable',
    description: 'Variable climática',
    enum: Object.keys(WEATHER_VARIABLES_METADATA),
  })
  @ApiParam({
    name: 'datetime',
    description:
      'Momento temporal (ej: now, +1hours, +6hours, 2025-01-20T15:00)',
    example: 'now',
  })
  @ApiParam({
    name: 'x',
    description: 'Coordenada X del tile (Google Maps notation)',
    example: '256',
  })
  @ApiParam({
    name: 'y',
    description: 'Coordenada Y del tile (Google Maps notation)',
    example: '128',
  })
  @ApiParam({
    name: 'z',
    description: 'Nivel de zoom del tile (Google Maps notation)',
    example: '8',
  })
  @ApiResponse({
    status: 200,
    description: 'Tile PNG devuelto exitosamente',
    content: {
      'image/png': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Variable climática no válida' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  public async getTile(
    @Param('variable') variable: string,
    @Param('datetime') datetime: string,
    @Param('x') x: string,
    @Param('y') y: string,
    @Param('z') z: string,
    @Res() res: Response,
  ) {
    // Validar que la variable sea válida
    if (!Object.keys(WEATHER_VARIABLES_METADATA).includes(variable)) {
      throw new BadRequestException(
        `Variable '${variable}' no válida. Variables disponibles: ${Object.keys(WEATHER_VARIABLES_METADATA).join(', ')}`,
      );
    }

    // Validar formato básico de coordenadas
    const xNum = parseInt(x, 10);
    const yNum = parseInt(y, 10);
    const zNum = parseInt(z, 10);

    if (isNaN(xNum) || isNaN(yNum) || isNaN(zNum) || zNum < 1 || zNum > 18) {
      throw new BadRequestException(
        'Coordenadas de tile no válidas. X, Y deben ser números y Z debe estar entre 1-18',
      );
    }

    const tileBuffer = await this.service.getTile(
      variable as WeatherVariable,
      datetime,
      x,
      y,
      z,
    );

    // Configurar headers apropiados para PNG
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': tileBuffer.length.toString(),
      'Cache-Control': 'public, max-age=900', // Cache por 15 minutos
      'Access-Control-Allow-Origin': '*', // Permitir CORS para tiles
    });

    res.send(tileBuffer);
  }
}
