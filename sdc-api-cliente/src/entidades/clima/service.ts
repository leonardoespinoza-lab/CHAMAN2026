import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { IPermiso, IEstablecimiento, IUbicacion } from 'modelos/src';
import { EstablecimientosService } from '../establecimiento/service';
import { TileCacheService } from '../../auxiliares/tile-cache/tile-cache.service';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { TileCalculationService } from '../../auxiliares/tile-calculation/tile-calculation.service';
import { API_CLIMA } from '../../env';

@Injectable()
export class ClimaService {
  private readonly logger = new Logger(ClimaService.name);

  constructor(
    private readonly establecimientosService: EstablecimientosService,
    private readonly tileCacheService: TileCacheService,
    private readonly axiosService: AxiosService,
    private readonly httpService: HttpService,
    private readonly tileCalculationService: TileCalculationService,
  ) {}

  /**
   * Obtiene tiles climáticos para todos los establecimientos del usuario
   * Con cache optimizado TTL 60 min + normalización horaria
   */
  async getTiles(
    variable: string,
    datetime: string,
    zoom: number = 8,
    permiso: IPermiso,
  ) {
    let establecimientos: IEstablecimiento[] = [];

    try {
      // Obtener establecimientos del usuario
      const result = await this.establecimientosService.get({}, permiso);
      establecimientos = result.datos;

      if (!establecimientos || establecimientos.length === 0) {
        return {
          success: false,
          message: 'No se encontraron establecimientos para el usuario',
          variable,
          datetime,
          zoom,
          establecimientosCount: 0,
          bounds: null,
          tiles: [],
          totalTiles: 0,
          cacheStats: {
            hits: 0,
            misses: 0,
          },
        };
      }

      // Extraer ubicaciones con polígonos de los establecimientos (método unificado)
      const ubicacionesConPoligonos =
        this.tileCalculationService.extractUbicacionesFromEstablecimientos(
          establecimientos,
        );

      this.logger.debug(
        `Extraídas ${ubicacionesConPoligonos.length} ubicaciones con polígonos`,
      );

      // Generar tiles usando algoritmo de intersección de polígonos (mismo que cache warming)
      const allTiles = [];
      for (const ubicacion of ubicacionesConPoligonos) {
        const tilesForLocation =
          this.tileCalculationService.calculateTilesIntersectingPolygon(
            ubicacion.poligono,
            zoom,
          );
        allTiles.push(...tilesForLocation);
      }

      // Eliminar duplicados
      const uniqueTiles = allTiles.filter(
        (tile, index, self) =>
          index ===
          self.findIndex(
            (t) => t.x === tile.x && t.y === tile.y && t.z === tile.z,
          ),
      );

      this.logger.debug(
        `Generados ${uniqueTiles.length} tiles únicos para zoom ${zoom} usando intersección de polígonos`,
      );

      // Obtener tiles desde cache o descargar
      const tilesWithData = await Promise.all(
        uniqueTiles.map(async (tile) => {
          // Intentar obtener desde cache primero
          const cachedTile = await this.tileCacheService.getTile(
            variable,
            datetime,
            tile.x,
            tile.y,
            tile.z,
          );

          if (cachedTile) {
            // Si está en cache, devolver datos base64
            return {
              x: tile.x,
              y: tile.y,
              z: tile.z,
              data: cachedTile.data.toString('base64'),
              fromCache: true,
            };
          } else {
            // Cache miss - descargar desde api-clima
            const startTime = Date.now();
            try {
              const tileData = await this.downloadTileFromApiClima(
                variable,
                datetime,
                tile.x,
                tile.y,
                tile.z,
              );

              // Guardar en cache para próximas consultas
              await this.tileCacheService.setTile(
                variable,
                datetime,
                tile.x,
                tile.y,
                tile.z,
                tileData,
                'image/png',
              );

              const downloadTime = Date.now() - startTime;
              return {
                x: tile.x,
                y: tile.y,
                z: tile.z,
                data: tileData.toString('base64'),
                fromCache: false,
                downloadTimeMs: downloadTime,
              };
            } catch (error) {
              this.logger.warn(
                `Error descargando tile ${tile.x}/${tile.y}/${tile.z}: ${error.message}`,
              );

              // Devolver tile sin datos en caso de error
              return {
                x: tile.x,
                y: tile.y,
                z: tile.z,
                data: null,
                fromCache: false,
                downloadTimeMs: Date.now() - startTime,
                error: error.message,
              };
            }
          }
        }),
      );

      // Filtrar tiles que se descargaron exitosamente y devolver respuesta
      const validTiles = tilesWithData.filter((tile) => tile.data !== null);
      const cacheHits = tilesWithData.filter((tile) => tile.fromCache).length;
      const cacheMisses = tilesWithData.length - cacheHits;
      const cacheHitRate =
        tilesWithData.length > 0
          ? ((cacheHits / tilesWithData.length) * 100).toFixed(1)
          : '0.0';

      // Log de estadísticas de cache
      this.logger.log(
        `📊 Tiles request completado: ${validTiles.length} tiles válidos, ${cacheHits} cache hits, ${cacheMisses} cache misses (${cacheHitRate}% hit rate)`,
      );

      // Calcular bounds para el response (usando el nuevo servicio)
      const bounds =
        this.tileCalculationService.calculateEstablecimientosBounds(
          ubicacionesConPoligonos,
        );

      return {
        success: true,
        message: 'Tiles obtenidos exitosamente',
        variable,
        datetime,
        zoom,
        establecimientosCount: establecimientos.length,
        bounds,
        tiles: validTiles,
        totalTiles: validTiles.length,
        cacheStats: {
          hits: cacheHits,
          misses: cacheMisses,
        },
      };
    } catch (error) {
      this.logger.error(`Error en getTiles: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || 'Error desconocido obteniendo tiles',
        variable,
        datetime,
        zoom,
        establecimientosCount: establecimientos.length,
        bounds: null,
        tiles: [],
        totalTiles: 0,
        cacheStats: {
          hits: 0,
          misses: 0,
        },
      };
    }
  }

  /**
   * Obtiene tiles climáticos para un viewport específico
   * Evita el downscaling automático de Meteosource al solicitar solo el área visible
   */
  async getTilesForViewport(
    variable: string,
    datetime: string,
    zoom: number = 8,
    bounds: {
      minLat: number;
      maxLat: number;
      minLng: number;
      maxLng: number;
    },
  ) {
    try {
      // Validar bounds del viewport
      if (
        !bounds ||
        typeof bounds.minLat !== 'number' ||
        typeof bounds.maxLat !== 'number' ||
        typeof bounds.minLng !== 'number' ||
        typeof bounds.maxLng !== 'number' ||
        bounds.minLat >= bounds.maxLat ||
        bounds.minLng >= bounds.maxLng
      ) {
        return {
          success: false,
          message: 'Bounds del viewport inválidos',
          variable,
          datetime,
          zoom,
          bounds: null,
          tiles: [],
          totalTiles: 0,
        };
      }

      // Usar el nuevo servicio de TileCalculation para calcular los tiles
      const tilesCoords = this.tileCalculationService.calculateTilesForBounds(
        bounds,
        zoom,
      );

      this.logger.log(
        `📍 Generando ${tilesCoords.length} tiles para viewport [${bounds.minLat.toFixed(4)}, ${bounds.minLng.toFixed(4)}, ${bounds.maxLat.toFixed(4)}, ${bounds.maxLng.toFixed(4)}] zoom ${zoom}`,
      );

      // Obtener tiles con datos usando el mismo sistema de cache
      const tilesWithData = await Promise.all(
        tilesCoords.map(async (tile) => {
          // Intentar obtener del cache primero
          const cachedTile = await this.tileCacheService.getTile(
            variable,
            datetime,
            tile.x,
            tile.y,
            tile.z,
          );

          if (cachedTile) {
            // Si está en cache, devolver datos base64
            return {
              x: tile.x,
              y: tile.y,
              z: tile.z,
              data: cachedTile.data.toString('base64'),
              fromCache: true,
            };
          } else {
            // Cache miss - descargar desde api-clima
            const startTime = Date.now();
            try {
              const tileData = await this.downloadTileFromApiClima(
                variable,
                datetime,
                tile.x,
                tile.y,
                tile.z,
              );

              // Guardar en cache para próximas consultas
              await this.tileCacheService.setTile(
                variable,
                datetime,
                tile.x,
                tile.y,
                tile.z,
                tileData,
                'image/png',
              );

              const downloadTime = Date.now() - startTime;
              return {
                x: tile.x,
                y: tile.y,
                z: tile.z,
                data: tileData.toString('base64'),
                fromCache: false,
                downloadTimeMs: downloadTime,
              };
            } catch (error) {
              this.logger.warn(
                `Error descargando tile ${tile.x}/${tile.y}/${tile.z}: ${error.message}`,
              );

              // Devolver tile sin datos en caso de error
              return {
                x: tile.x,
                y: tile.y,
                z: tile.z,
                data: null,
                fromCache: false,
                downloadTimeMs: Date.now() - startTime,
                error: error.message,
              };
            }
          }
        }),
      );

      // Filtrar tiles que se descargaron exitosamente y devolver respuesta
      const validTiles = tilesWithData.filter((tile) => tile.data !== null);
      const cacheHits = tilesWithData.filter((tile) => tile.fromCache).length;
      const cacheMisses = tilesWithData.length - cacheHits;
      const cacheHitRate =
        tilesWithData.length > 0
          ? ((cacheHits / tilesWithData.length) * 100).toFixed(1)
          : '0.0';

      // Log de estadísticas de cache
      this.logger.log(
        `📊 Tiles viewport request completado: ${validTiles.length} tiles válidos, ${cacheHits} cache hits, ${cacheMisses} cache misses (${cacheHitRate}% hit rate)`,
      );

      return {
        success: true,
        message: 'Tiles de viewport obtenidos exitosamente',
        variable,
        datetime,
        zoom,
        bounds,
        tiles: validTiles,
        totalTiles: validTiles.length,
        cacheStats: {
          hits: cacheHits,
          misses: cacheMisses,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error en getTilesForViewport: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        message: error.message || 'Error desconocido obteniendo tiles viewport',
        variable,
        datetime,
        zoom,
        bounds,
        tiles: [],
        totalTiles: 0,
        cacheStats: {
          hits: 0,
          misses: 0,
        },
      };
    }
  }

  /**
   * Calcula los bounds mínimos para cubrir todos los establecimientos
   * Considera que cada establecimiento puede tener múltiples ubicaciones/polígonos
   */
  private calculateEstablecimientosBounds(
    establecimientos: IEstablecimiento[],
  ) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    let hasValidCoordinates = false;
    let totalUbicaciones = 0;
    let ubicacionesProcessed = 0;

    this.logger.debug(
      `Procesando ${establecimientos.length} establecimientos para calcular bounds`,
    );

    establecimientos.forEach((est) => {
      // Verificar si el establecimiento tiene ubicaciones
      if (
        !est.ubicacion ||
        !Array.isArray(est.ubicacion) ||
        est.ubicacion.length === 0
      ) {
        this.logger.warn(
          `Establecimiento ${est.nombre || est._id} no tiene ubicaciones válidas`,
        );
        return;
      }

      totalUbicaciones += est.ubicacion.length;
      this.logger.debug(
        `Establecimiento "${est.nombre}" tiene ${est.ubicacion.length} ubicaciones`,
      );

      // Procesar cada ubicación del establecimiento
      est.ubicacion.forEach((ubicacion: IUbicacion, ubIndex: number) => {
        let ubicacionProcessed = false;

        // Opción 1: Usar el centro si está disponible (más eficiente)
        if (ubicacion.centro && ubicacion.centro.lat && ubicacion.centro.lng) {
          minLat = Math.min(minLat, ubicacion.centro.lat);
          maxLat = Math.max(maxLat, ubicacion.centro.lat);
          minLng = Math.min(minLng, ubicacion.centro.lng);
          maxLng = Math.max(maxLng, ubicacion.centro.lng);
          hasValidCoordinates = true;
          ubicacionProcessed = true;
          this.logger.debug(
            `Establecimiento "${est.nombre}" ubicación ${ubIndex + 1}: usando centro [${ubicacion.centro.lat}, ${ubicacion.centro.lng}]`,
          );
        }

        // Opción 2: Si no hay centro, usar el GeoJSON del polígono
        else if (
          ubicacion.geojson &&
          ubicacion.geojson.type === 'Polygon' &&
          ubicacion.geojson.coordinates &&
          ubicacion.geojson.coordinates[0]
        ) {
          const coordinates = ubicacion.geojson.coordinates[0]; // Primer anillo del polígono
          if (coordinates && Array.isArray(coordinates)) {
            let coordenadasValidas = 0;
            coordinates.forEach((coord: [number, number]) => {
              if (
                coord &&
                coord.length >= 2 &&
                typeof coord[0] === 'number' &&
                typeof coord[1] === 'number'
              ) {
                const lng = coord[0];
                const lat = coord[1];
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
                hasValidCoordinates = true;
                ubicacionProcessed = true;
                coordenadasValidas++;
              }
            });
            this.logger.debug(
              `Establecimiento "${est.nombre}" ubicación ${ubIndex + 1}: procesadas ${coordenadasValidas} coordenadas del GeoJSON`,
            );
          }
        }

        // Opción 3: Si no hay GeoJSON, usar el array de polígono
        else if (ubicacion.poligono && Array.isArray(ubicacion.poligono)) {
          let coordenadasValidas = 0;
          ubicacion.poligono.forEach((coord: any) => {
            if (
              coord &&
              coord.lat &&
              coord.lng &&
              typeof coord.lat === 'number' &&
              typeof coord.lng === 'number'
            ) {
              minLat = Math.min(minLat, coord.lat);
              maxLat = Math.max(maxLat, coord.lat);
              minLng = Math.min(minLng, coord.lng);
              maxLng = Math.max(maxLng, coord.lng);
              hasValidCoordinates = true;
              ubicacionProcessed = true;
              coordenadasValidas++;
            }
          });
          this.logger.debug(
            `Establecimiento "${est.nombre}" ubicación ${ubIndex + 1}: procesadas ${coordenadasValidas} coordenadas del polígono`,
          );
        }

        if (!ubicacionProcessed) {
          this.logger.warn(
            `Establecimiento "${est.nombre}" ubicación ${ubIndex + 1} (${ubicacion.nombre || 'sin nombre'}) no tiene coordenadas válidas`,
          );
        } else {
          ubicacionesProcessed++;
        }
      });
    });

    this.logger.debug(
      `Procesamiento completado: ${ubicacionesProcessed}/${totalUbicaciones} ubicaciones procesadas exitosamente`,
    );

    // Verificar si se encontraron coordenadas válidas
    if (!hasValidCoordinates || minLat === Infinity) {
      this.logger.warn(
        'No se encontraron coordenadas válidas en ningún establecimiento',
      );
      return {
        minLat: null,
        maxLat: null,
        minLng: null,
        maxLng: null,
      };
    }

    // Calcular las dimensiones del área
    const latRange = maxLat - minLat;
    const lngRange = maxLng - minLng;

    // Agregar margen para mejorar visualización (mínimo 0.01 grados, máximo 10% del rango)
    const marginLat = Math.max(latRange * 0.1, 0.01);
    const marginLng = Math.max(lngRange * 0.1, 0.01);

    const bounds = {
      minLat: minLat - marginLat,
      maxLat: maxLat + marginLat,
      minLng: minLng - marginLng,
      maxLng: maxLng + marginLng,
    };

    this.logger.debug(
      `Bounds calculados: área ${latRange.toFixed(4)}° x ${lngRange.toFixed(4)}°, ` +
        `con margen ${marginLat.toFixed(4)}° x ${marginLng.toFixed(4)}°`,
    );

    return bounds;
  }

  /**
   * Genera la lista de tiles necesarios para cubrir los bounds dados
   */
  private generateTilesForBounds(bounds: any, zoom: number) {
    const tiles = [];

    // Verificar si los bounds son válidos
    if (
      !bounds ||
      bounds.minLat === null ||
      bounds.maxLat === null ||
      bounds.minLng === null ||
      bounds.maxLng === null
    ) {
      this.logger.warn('Bounds inválidos, no se pueden generar tiles');
      return tiles;
    }

    // Convertir coordenadas geográficas a coordenadas de tile
    const minTileX = this.lngToTileX(bounds.minLng, zoom);
    const maxTileX = this.lngToTileX(bounds.maxLng, zoom);
    const minTileY = this.latToTileY(bounds.maxLat, zoom); // Nota: Y invertido
    const maxTileY = this.latToTileY(bounds.minLat, zoom);

    for (let x = minTileX; x <= maxTileX; x++) {
      for (let y = minTileY; y <= maxTileY; y++) {
        tiles.push({ x, y, z: zoom });
      }
    }

    return tiles;
  }

  /**
   * Convierte longitud a coordenada X de tile
   */
  private lngToTileX(lng: number, zoom: number): number {
    return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  }

  /**
   * Convierte latitud a coordenada Y de tile
   */
  private latToTileY(lat: number, zoom: number): number {
    const latRad = (lat * Math.PI) / 180;
    return Math.floor(
      ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * Math.pow(2, zoom),
    );
  }

  /**
   * Descarga un tile desde api-clima
   */
  private async downloadTileFromApiClima(
    variable: string,
    datetime: string,
    x: number,
    y: number,
    z: number,
  ): Promise<Buffer> {
    // Construir URL correcta para el API de clima
    // La ruta del api-clima es: /meteoSource/tiles/:variable/:datetime/:x/:y/:z
    const url = `${API_CLIMA}/meteoSource/tiles/${variable}/${datetime}/${x}/${y}/${z}`;

    // Log para debugging de la URL que se está construyendo
    console.log(`🔗 Llamando al api-clima:`, {
      url,
      parameters: { variable, datetime, x, y, z },
    });

    const response = await firstValueFrom(
      this.httpService.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
      }),
    );

    return Buffer.from(response.data);
  }

  // Métodos existentes del servicio de clima
  async getClimaEntreFechas(
    lat: number,
    lng: number,
    from: string,
    to: string,
  ): Promise<any[]> {
    try {
      const url = `${API_CLIMA}/clima/estacion/cerca/${lat}/${lng}/${from}/${to}`;
      const response = await this.axiosService.GET<any[]>(url);
      return response || [];
    } catch (error) {
      this.logger.error(`Error en getClimaEntreFechas: ${error.message}`);
      throw error;
    }
  }

  async getClima(lat: number, lng: number): Promise<any> {
    try {
      const url = `${API_CLIMA}/clima/estacion/cerca/${lat}/${lng}`;
      const response = await this.axiosService.GET<any>(url);
      return response;
    } catch (error) {
      this.logger.error(`Error en getClima: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cache de establecimientos por usuario para evitar consultas repetidas
   */
  private establecimientosCache = new Map<string, any[]>();
  private establecimientosCacheExpiry = new Map<string, number>();
  private readonly ESTABLECIMIENTOS_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  /**
   * Obtiene establecimientos del usuario usando cache interno
   */
  private async getEstablecimientosConCache(permiso: IPermiso): Promise<any[]> {
    const cacheKey = `${permiso.idQuimica || 'q'}-${permiso.idDistribuidor || 'd'}-${permiso.idProductor || 'p'}-${permiso.idEstablecimiento || 'e'}`;
    const now = Date.now();

    // Verificar si tenemos en cache y no expiró
    if (this.establecimientosCache.has(cacheKey)) {
      const expiry = this.establecimientosCacheExpiry.get(cacheKey) || 0;
      if (now < expiry) {
        return this.establecimientosCache.get(cacheKey) || [];
      }
    }

    // Cache miss o expirado - obtener del servicio
    const establecimientos = await this.establecimientosService.get(
      {},
      permiso,
    );
    const datos = establecimientos.datos || [];

    // Guardar en cache
    this.establecimientosCache.set(cacheKey, datos);
    this.establecimientosCacheExpiry.set(
      cacheKey,
      now + this.ESTABLECIMIENTOS_CACHE_TTL,
    );

    return datos;
  }

  /**
   * Obtiene un tile climático individual para coordenadas específicas
   * Compatible con el sistema estándar XYZ de OpenLayers
   */
  async getSingleTile(
    variable: string,
    datetime: string,
    z: number,
    x: number,
    y: number,
    permiso: IPermiso,
  ): Promise<Buffer> {
    try {
      // Intentar obtener del cache primero
      const cachedTile = await this.tileCacheService.getTile(
        variable,
        datetime,
        x,
        y,
        z,
      );

      if (cachedTile) {
        // SOLO log para debugging si es necesario
        // this.logger.debug(`Cache hit para tile ${variable}/${z}/${x}/${y}`);
        return cachedTile.data;
      }

      // Descargar tile directamente desde api-clima (Meteosource)
      const tileData = await this.downloadTileFromApiClima(
        variable,
        datetime,
        x,
        y,
        z,
      );

      // Guardar en cache para próximas consultas
      await this.tileCacheService.setTile(
        variable,
        datetime,
        x,
        y,
        z,
        tileData,
        'image/png',
      );

      return tileData;
    } catch (error) {
      this.logger.error(
        `Error obteniendo tile individual ${variable}/${z}/${x}/${y}: ${error.message}`,
      );
      // En caso de error, devolver tile transparente para no romper el mapa
      return this.createTransparentTile();
    }
  }

  /**
   * Crea un tile PNG transparente de 256x256 píxeles
   */
  private createTransparentTile(): Buffer {
    // PNG transparente mínimo de 256x256 en base64
    const transparentPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAANSURBVHic7cEBAQAAAICQ/q/uCAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4GcAAdQAAQdVJw4AAAAASUVORK5CYII=';
    return Buffer.from(transparentPngBase64, 'base64');
  }

  /**
   * Calcula los bounds geográficos de un tile XYZ con un pequeño margen de tolerancia
   */
  private getTileBounds(
    x: number,
    y: number,
    z: number,
  ): {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  } {
    const n = Math.pow(2, z);

    const minLng = (x / n) * 360 - 180;
    const maxLng = ((x + 1) / n) * 360 - 180;

    const minLatRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)));
    const maxLatRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));

    const minLat = (minLatRad * 180) / Math.PI;
    const maxLat = (maxLatRad * 180) / Math.PI;

    // Agregar un pequeño margen de tolerancia para mejorar detección en bordes
    // Especialmente útil para zooms más bajos donde los tiles son más grandes
    const tolerance = 0.0001 * Math.pow(2, 14 - z); // Más tolerancia en zooms bajos

    return {
      minLat: minLat - tolerance,
      maxLat: maxLat + tolerance,
      minLng: minLng - tolerance,
      maxLng: maxLng + tolerance,
    };
  }

  async getSemaforo(lat: number, lng: number): Promise<any> {
    try {
      const url = `${API_CLIMA}/clima/semaforo/${lat}/${lng}`;
      const response = await this.axiosService.GET<any>(url);
      return response;
    } catch (error) {
      this.logger.error(`Error en getSemaforo: ${error.message}`);
      throw error;
    }
  }
}
