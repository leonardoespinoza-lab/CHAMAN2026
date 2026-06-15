import { Controller, Get, Param, UseGuards, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';
import { IPermiso } from 'modelos/src';
import { ClimaService } from './service';

// Variables climáticas disponibles
type WeatherVariable =
  | 'temperature'
  | 'precipitation'
  | 'clouds'
  | 'wind_speed'
  | 'humidity'
  | 'pressure';

@ApiTags('Clima')
@Controller('clima')
export class ClimaController {
  constructor(private service: ClimaService) {}

  @Get('estacion/cerca/:lat/:lng/:from/:to')
  @UseGuards(PermisoGuard)
  public async getClimaEntreFechas(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
    @Param('from') from: string,
    @Param('to') to: string,
  ) {
    return await this.service.getClimaEntreFechas(lat, lng, from, to);
  }

  @Get('estacion/cerca/:lat/:lng')
  @UseGuards(PermisoGuard)
  public async getClima(@Param('lat') lat: number, @Param('lng') lng: number) {
    return await this.service.getClima(lat, lng);
  }

  @Get('semaforo/:lat/:lng')
  @UseGuards(PermisoGuard)
  public async getSemaforo(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
  ) {
    return await this.service.getSemaforo(lat, lng);
  }

  @Get('frio-termico/:lat/:lng')
  @UseGuards(PermisoGuard)
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getFrioTermico(
    @Param('lat') lat: number,
    @Param('lng') lng: number,
    @Query('cultivo') cultivo?: string,
    @Query('horasFrioObjetivo') horasFrioObjetivo?: string,
    @Query('horasFrioEfectivasObjetivo')
    horasFrioEfectivasObjetivo?: string,
    @Query('porcionesFrioObjetivo') porcionesFrioObjetivo?: string,
    @Query('temperaturaBaseGradosDia') temperaturaBaseGradosDia?: string,
    @Query('gradosDiaBrotacionObjetivo')
    gradosDiaBrotacionObjetivo?: string,
    @Query('gradosDiaFloracionObjetivo')
    gradosDiaFloracionObjetivo?: string,
  ) {
    return await this.service.getFrioTermico(Number(lat), Number(lng), cultivo, {
      horasFrioObjetivo: this.toNumberOrUndefined(horasFrioObjetivo),
      horasFrioEfectivasObjetivo: this.toNumberOrUndefined(
        horasFrioEfectivasObjetivo,
      ),
      porcionesFrioObjetivo: this.toNumberOrUndefined(porcionesFrioObjetivo),
      temperaturaBaseGradosDia: this.toNumberOrUndefined(
        temperaturaBaseGradosDia,
      ),
      gradosDiaBrotacionObjetivo: this.toNumberOrUndefined(
        gradosDiaBrotacionObjetivo,
      ),
      gradosDiaFloracionObjetivo: this.toNumberOrUndefined(
        gradosDiaFloracionObjetivo,
      ),
    });
  }

  /**
   * Endpoint de producción para obtener tiles climáticos actuales
   * SOLO para usuarios Productor y Establecimiento
   * Devuelve una lista de tiles para la región de establecimientos del usuario
   */

  @Get('tiles/:variable')
  @UseGuards(PermisoGuard)
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] }, // Solo admin para debug/soporte
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  @ApiOperation({
    summary: 'Obtener tiles climáticos (solo Productores)',
    description:
      'Devuelve los tiles necesarios para cubrir todos los establecimientos del usuario autenticado. ACCESO RESTRINGIDO: Solo usuarios de nivel Productor o Establecimiento pueden acceder a este endpoint.',
  })
  @ApiParam({
    name: 'variable',
    description: 'Variable climática a mostrar',
    enum: [
      'temperature',
      'precipitation',
      'clouds',
      'wind_speed',
      'humidity',
      'pressure',
    ],
    example: 'temperature',
  })
  @ApiQuery({
    name: 'zoom',
    description: 'Nivel de zoom para los tiles (1-18)',
    example: 8,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de tiles necesarios para los establecimientos',
    schema: {
      type: 'object',
      properties: {
        variable: { type: 'string' },
        datetime: { type: 'string' },
        zoom: { type: 'number' },
        bounds: {
          type: 'object',
          properties: {
            minLat: { type: 'number' },
            maxLat: { type: 'number' },
            minLng: { type: 'number' },
            maxLng: { type: 'number' },
          },
        },
        tiles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              z: { type: 'number' },
              url: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado: Solo usuarios Productor/Establecimiento',
  })
  @ApiResponse({
    status: 404,
    description: 'No se encontraron establecimientos',
  })
  public async getTiles(
    @Param('variable') variable: WeatherVariable,
    @Query('zoom') zoom: string = '8',
    @GetPermiso() permiso: IPermiso,
  ) {
    // Siempre usar datos climáticos actuales
    const datetime = 'now';

    return await this.service.getTiles(
      variable,
      datetime,
      parseInt(zoom),
      permiso,
    );
  }

  /**
   * Endpoint para obtener un tile climático individual
   * Compatible con el sistema estándar XYZ de OpenLayers
   */
  @Get('tile/:variable/:z/:x/:y')
  @UseGuards(PermisoGuard)
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  @ApiOperation({
    summary: 'Obtener tile climático individual (solo Productores)',
    description:
      'Devuelve un tile específico para las coordenadas XYZ dadas. Si el tile intersecta con los establecimientos del usuario, devuelve los datos climáticos. Si no intersecta, devuelve un tile transparente. Compatible con el sistema estándar de tiles de OpenLayers.',
  })
  @ApiParam({
    name: 'variable',
    enum: [
      'temperature',
      'precipitation',
      'clouds',
      'wind_speed',
      'humidity',
      'pressure',
    ],
    description: 'Variable climática a consultar',
  })
  @ApiParam({
    name: 'z',
    description: 'Nivel de zoom del tile (1-18)',
  })
  @ApiParam({
    name: 'x',
    description: 'Coordenada X del tile',
  })
  @ApiParam({
    name: 'y',
    description: 'Coordenada Y del tile',
  })
  @ApiQuery({
    name: 'datetime',
    required: false,
    description: 'Fecha y hora en formato ISO (default: now)',
  })
  @ApiResponse({
    status: 200,
    description: 'Tile individual como imagen PNG',
    content: {
      'image/png': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  public async getSingleTile(
    @Param('variable') variable: WeatherVariable,
    @Param('z') z: string,
    @Param('x') x: string,
    @Param('y') y: string,
    @Query('datetime') datetime: string = 'now', // Usar 'now' por defecto, compatible con Meteosource
    @GetPermiso() permiso: IPermiso,
    @Res() res: Response,
  ): Promise<void> {
    const tileBuffer = await this.service.getSingleTile(
      variable,
      datetime,
      parseInt(z),
      parseInt(x),
      parseInt(y),
      permiso,
    );

    // Configurar headers para imagen PNG
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache por 1 hora
    res.send(tileBuffer);
  }

  /**
   * Endpoint para obtener tiles climáticos basados en viewport
   * Evita el downscaling automático de Meteosource solicitando solo el área visible
   */
  @Get('tiles/:variable/viewport')
  @UseGuards(PermisoGuard)
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  @ApiOperation({
    summary: 'Obtener tiles climáticos para viewport específico',
    description:
      'Devuelve los tiles necesarios para cubrir el área visible en el mapa (viewport). Este endpoint evita el downscaling automático de Meteosource al solicitar solo el área actualmente visible.',
  })
  @ApiParam({
    name: 'variable',
    description: 'Variable climática a mostrar',
    enum: [
      'temperature',
      'precipitation',
      'clouds',
      'wind_speed',
      'humidity',
      'pressure',
    ],
    example: 'temperature',
  })
  @ApiQuery({
    name: 'zoom',
    description: 'Nivel de zoom para los tiles (1-18)',
    example: 8,
    required: false,
  })
  @ApiQuery({
    name: 'minLat',
    description: 'Latitud mínima del viewport',
    example: -35.0,
    required: true,
  })
  @ApiQuery({
    name: 'maxLat',
    description: 'Latitud máxima del viewport',
    example: -34.0,
    required: true,
  })
  @ApiQuery({
    name: 'minLng',
    description: 'Longitud mínima del viewport',
    example: -60.0,
    required: true,
  })
  @ApiQuery({
    name: 'maxLng',
    description: 'Longitud máxima del viewport',
    example: -59.0,
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de tiles necesarios para el viewport',
    schema: {
      type: 'object',
      properties: {
        variable: { type: 'string' },
        datetime: { type: 'string' },
        zoom: { type: 'number' },
        bounds: {
          type: 'object',
          properties: {
            minLat: { type: 'number' },
            maxLat: { type: 'number' },
            minLng: { type: 'number' },
            maxLng: { type: 'number' },
          },
        },
        tiles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              z: { type: 'number' },
              url: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado: Solo usuarios Productor/Establecimiento',
  })
  public async getTilesForViewport(
    @Param('variable') variable: WeatherVariable,
    @Query('zoom') zoom: string = '8',
    @Query('minLat') minLat: number,
    @Query('maxLat') maxLat: number,
    @Query('minLng') minLng: number,
    @Query('maxLng') maxLng: number,
  ) {
    // Siempre usar datos climáticos actuales
    const datetime = 'now';

    const bounds = {
      minLat: Number(minLat),
      maxLat: Number(maxLat),
      minLng: Number(minLng),
      maxLng: Number(maxLng),
    };

    return await this.service.getTilesForViewport(
      variable,
      datetime,
      parseInt(zoom),
      bounds,
    );
  }

  private toNumberOrUndefined(value?: string): number | undefined {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }
}
