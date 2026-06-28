import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  CONFIGURACION_FRIO_CULTIVOS,
  esCultivoPerenne,
  IEstablecimiento,
  IFrioTermicoCultivo,
  IResumenRiesgosAgroclimaticos,
  IRiesgoAgroclimatico,
  NivelRiesgoAgroclimatico,
  IPermiso,
  ISerieFrioTermicoDia,
  IUbicacion,
  resolverContextoHeladaFenologico,
} from 'modelos/src';
import { EstablecimientosService } from '../establecimiento/service';
import { TileCacheService } from '../../auxiliares/tile-cache/tile-cache.service';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { TileCalculationService } from '../../auxiliares/tile-calculation/tile-calculation.service';
import { API_CLIMA } from '../../env';

@Injectable()
export class ClimaService {
  private readonly logger = new Logger(ClimaService.name);
  private readonly timezone = 'America/Argentina/Buenos_Aires';
  private readonly FRIO_TERMICO_CACHE_TTL_MS = 15 * 60 * 1000;
  private readonly FRIO_TERMICO_CACHE_MAX = 500;
  private readonly frioTermicoCache = new Map<
    string,
    { expiresAt: number; value: IFrioTermicoCultivo }
  >();

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

  async getFrioTermico(
    lat: number,
    lng: number,
    cultivo?: string,
    overrides: {
      horasFrioObjetivo?: number;
      horasFrioEfectivasObjetivo?: number;
      porcionesFrioObjetivo?: number;
      temperaturaBaseGradosDia?: number;
      gradosDiaBrotacionObjetivo?: number;
      gradosDiaFloracionObjetivo?: number;
    } = {},
  ): Promise<IFrioTermicoCultivo> {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      throw new Error('Coordenadas invalidas para calcular frio termico.');
    }

    const hoy = new Date();
    const config = CONFIGURACION_FRIO_CULTIVOS[cultivo || ''] || {
      requiereFrio: true,
      horasFrioObjetivo: 500,
      horasFrioEfectivasObjetivo: 400,
      porcionesFrioObjetivo: 35,
      temperaturaBaseGradosDia: 10,
      gradosDiaBrotacionObjetivo: 120,
      gradosDiaFloracionObjetivo: 260,
      umbralHelada: -1,
    };
    const requerimientos = {
      horasFrioObjetivo:
        overrides.horasFrioObjetivo ?? config.horasFrioObjetivo,
      horasFrioEfectivasObjetivo:
        overrides.horasFrioEfectivasObjetivo ??
        config.horasFrioEfectivasObjetivo,
      porcionesFrioObjetivo:
        overrides.porcionesFrioObjetivo ?? config.porcionesFrioObjetivo,
      temperaturaBaseGradosDia:
        overrides.temperaturaBaseGradosDia ??
        config.temperaturaBaseGradosDia ??
        10,
      gradosDiaBrotacionObjetivo:
        overrides.gradosDiaBrotacionObjetivo ??
        config.gradosDiaBrotacionObjetivo,
      gradosDiaFloracionObjetivo:
        overrides.gradosDiaFloracionObjetivo ??
        config.gradosDiaFloracionObjetivo,
    };
    const cacheKey = this.getFrioTermicoCacheKey(
      latNum,
      lngNum,
      cultivo,
      requerimientos,
    );
    const cached = this.frioTermicoCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const frioDesde = this.getInicioFrio(hoy);
    const termicoDesde = this.getInicioTermico(hoy);
    const ayer = this.addDays(this.startOfDay(hoy), -1);
    const historicoHasta = ayer >= frioDesde ? ayer : frioDesde;
    const historico = await this.fetchOpenMeteoDaily(
      latNum,
      lngNum,
      this.toDateKey(frioDesde),
      this.toDateKey(historicoHasta),
      false,
    );
    const forecast = await this.fetchOpenMeteoForecast(latNum, lngNum);
    const serieBase = this.mergeSeries(historico, forecast);
    const baseTermica = requerimientos.temperaturaBaseGradosDia || 10;
    const serie = serieBase.map((dia) => {
      const horasFrio = this.estimarHorasFrio(
        dia.temperaturaMin,
        dia.temperaturaMax,
      );
      const horasFrioEfectivas = this.estimarHorasFrioEfectivas(
        dia.temperaturaMedia,
      );
      const gradosDia = this.estimarGradosDia(
        dia.temperaturaMin,
        dia.temperaturaMax,
        baseTermica,
      );
      return {
        ...dia,
        horasFrio,
        horasFrioEfectivas,
        gradosDia,
      };
    });

    const frioSerie = serie.filter((dia) =>
      this.entreFechas(
        dia.fecha,
        this.toDateKey(frioDesde),
        this.toDateKey(hoy),
      ),
    );
    const termicoSerie = serie.filter((dia) =>
      this.entreFechas(
        dia.fecha,
        this.toDateKey(termicoDesde),
        this.toDateKey(this.addDays(hoy, 15)),
      ),
    );
    const acumulados = {
      horasFrio: this.round(
        frioSerie.reduce((acc, dia) => acc + (dia.horasFrio || 0), 0),
      ),
      horasFrioEfectivas: this.round(
        frioSerie.reduce((acc, dia) => acc + (dia.horasFrioEfectivas || 0), 0),
      ),
      porcionesFrio: 0,
      gradosDia: this.round(
        termicoSerie
          .filter(
            (dia) => !dia.esPronostico || dia.fecha <= this.toDateKey(hoy),
          )
          .reduce((acc, dia) => acc + (dia.gradosDia || 0), 0),
      ),
      lluvia: this.round(
        serie
          .filter((dia) =>
            this.entreFechas(
              dia.fecha,
              this.toDateKey(frioDesde),
              this.toDateKey(hoy),
            ),
          )
          .reduce((acc, dia) => acc + (dia.lluvia || 0), 0),
      ),
    };
    acumulados.porcionesFrio = this.round(acumulados.horasFrioEfectivas / 28);

    const progreso = {
      horasFrioPct: this.pct(
        acumulados.horasFrio,
        requerimientos.horasFrioObjetivo,
      ),
      horasFrioEfectivasPct: this.pct(
        acumulados.horasFrioEfectivas,
        requerimientos.horasFrioEfectivasObjetivo,
      ),
      porcionesFrioPct: this.pct(
        acumulados.porcionesFrio,
        requerimientos.porcionesFrioObjetivo,
      ),
      brotacionPct: this.pct(
        acumulados.gradosDia,
        requerimientos.gradosDiaBrotacionObjetivo,
      ),
      floracionPct: this.pct(
        acumulados.gradosDia,
        requerimientos.gradosDiaFloracionObjetivo,
      ),
    };
    const riesgoHelada = this.getRiesgoHelada(forecast, cultivo);
    const eventos = this.getEventosFrioTermico(
      progreso,
      riesgoHelada,
      acumulados,
    );

    const resultado: IFrioTermicoCultivo = {
      fuente: 'OpenMeteo',
      lat: latNum,
      lng: lngNum,
      cultivo,
      generadoEn: new Date().toISOString(),
      periodoFrio: {
        desde: this.toDateKey(frioDesde),
        hasta: this.toDateKey(hoy),
        dias: frioSerie.length,
      },
      periodoTermico: {
        desde: this.toDateKey(termicoDesde),
        hasta: this.toDateKey(hoy),
        dias: termicoSerie.filter((dia) => dia.fecha <= this.toDateKey(hoy))
          .length,
      },
      requerimientos,
      acumulados,
      progreso,
      riesgoHelada,
      eventos,
      serie,
      lectura: this.getLecturaFrioTermico(cultivo, progreso, riesgoHelada),
    };

    this.frioTermicoCache.set(cacheKey, {
      expiresAt: Date.now() + this.FRIO_TERMICO_CACHE_TTL_MS,
      value: resultado,
    });
    this.limpiarCacheFrioTermico();

    return resultado;
  }

  async getRiesgosAgroclimaticos(
    lat: number,
    lng: number,
    cultivo?: string,
    contexto: {
      variedad?: string;
      fechaSiembra?: string;
      etapaFenologica?: string;
    } = {},
  ): Promise<IResumenRiesgosAgroclimaticos> {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      throw new Error(
        'Coordenadas invalidas para calcular riesgos climaticos.',
      );
    }

    const serie = await this.fetchOpenMeteoAgroForecast(latNum, lngNum);
    return {
      fuente: 'OpenMeteo',
      lat: latNum,
      lng: lngNum,
      cultivo,
      generadoEn: new Date().toISOString(),
      helada: this.calcularRiesgoHeladaAgroclimatica(serie, cultivo, contexto),
      granizo: this.calcularRiesgoGranizo(serie),
    };
  }

  private getFrioTermicoCacheKey(
    lat: number,
    lng: number,
    cultivo: string | undefined,
    requerimientos: Record<string, number | undefined>,
  ): string {
    const req = Object.entries(requerimientos)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value ?? ''}`)
      .join('|');
    return [
      this.round(lat, 4),
      this.round(lng, 4),
      cultivo || 'cultivo',
      this.toDateKey(new Date()),
      req,
    ].join('|');
  }

  private limpiarCacheFrioTermico(): void {
    if (this.frioTermicoCache.size <= this.FRIO_TERMICO_CACHE_MAX) {
      return;
    }
    const now = Date.now();
    for (const [key, value] of this.frioTermicoCache.entries()) {
      if (
        value.expiresAt <= now ||
        this.frioTermicoCache.size > this.FRIO_TERMICO_CACHE_MAX
      ) {
        this.frioTermicoCache.delete(key);
      }
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

  private async fetchOpenMeteoDaily(
    lat: number,
    lng: number,
    from: string,
    to: string,
    esPronostico: boolean,
  ): Promise<ISerieFrioTermicoDia[]> {
    if (from > to) return [];
    const url = 'https://archive-api.open-meteo.com/v1/archive';
    const response = await firstValueFrom(
      this.httpService.get(url, {
        params: {
          latitude: lat,
          longitude: lng,
          start_date: from,
          end_date: to,
          daily:
            'temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum',
          timezone: this.timezone,
        },
        timeout: 12000,
      }),
    );
    return this.normalizarOpenMeteoDaily(response.data, esPronostico);
  }

  private async fetchOpenMeteoForecast(
    lat: number,
    lng: number,
  ): Promise<ISerieFrioTermicoDia[]> {
    const url = 'https://api.open-meteo.com/v1/forecast';
    const response = await firstValueFrom(
      this.httpService.get(url, {
        params: {
          latitude: lat,
          longitude: lng,
          forecast_days: 16,
          daily:
            'temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum',
          timezone: this.timezone,
        },
        timeout: 12000,
      }),
    );
    return this.normalizarOpenMeteoDaily(response.data, true);
  }

  private async fetchOpenMeteoAgroForecast(
    lat: number,
    lng: number,
  ): Promise<ISerieFrioTermicoDia[]> {
    const url = 'https://api.open-meteo.com/v1/forecast';
    const response = await firstValueFrom(
      this.httpService.get(url, {
        params: {
          latitude: lat,
          longitude: lng,
          forecast_days: 7,
          daily:
            'temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,precipitation_probability_max,showers_sum,weather_code,wind_gusts_10m_max',
          hourly:
            'cape,showers,precipitation_probability,weather_code,wind_gusts_10m',
          timezone: this.timezone,
        },
        timeout: 12000,
      }),
    );
    return this.normalizarOpenMeteoAgroForecast(response.data);
  }

  private normalizarOpenMeteoAgroForecast(data: any): ISerieFrioTermicoDia[] {
    const daily = data?.daily || {};
    const fechas: string[] = daily.time || [];
    const hourly = data?.hourly || {};
    const hourlyByDate = this.agruparHourlyAgro(hourly);
    return fechas.map((fecha, index) => {
      const hourlyDia = hourlyByDate.get(fecha) || {};
      return {
        fecha,
        temperaturaMax: this.round(daily.temperature_2m_max?.[index]),
        temperaturaMin: this.round(daily.temperature_2m_min?.[index]),
        temperaturaMedia: this.round(daily.temperature_2m_mean?.[index]),
        lluvia: this.round(daily.precipitation_sum?.[index] || 0),
        probabilidadLluvia: this.round(
          daily.precipitation_probability_max?.[index] ??
            hourlyDia.probabilidadLluvia,
          0,
        ),
        showers: this.round(daily.showers_sum?.[index] ?? hourlyDia.showers),
        weatherCode: daily.weather_code?.[index] ?? hourlyDia.weatherCode,
        cape: this.round(hourlyDia.cape, 0),
        rafagaViento: this.round(
          daily.wind_gusts_10m_max?.[index] ?? hourlyDia.rafagaViento,
        ),
        esPronostico: true,
      };
    });
  }

  private agruparHourlyAgro(hourly: any): Map<string, Record<string, number>> {
    const result = new Map<string, Record<string, number>>();
    const times: string[] = hourly?.time || [];
    times.forEach((time, index) => {
      const fecha = String(time || '').slice(0, 10);
      if (!fecha) return;
      const item = result.get(fecha) || {};
      item.cape = Math.max(item.cape || 0, Number(hourly.cape?.[index] || 0));
      item.showers = Math.max(
        item.showers || 0,
        Number(hourly.showers?.[index] || 0),
      );
      item.probabilidadLluvia = Math.max(
        item.probabilidadLluvia || 0,
        Number(hourly.precipitation_probability?.[index] || 0),
      );
      item.rafagaViento = Math.max(
        item.rafagaViento || 0,
        Number(hourly.wind_gusts_10m?.[index] || 0),
      );
      const code = Number(hourly.weather_code?.[index]);
      if (Number.isFinite(code) && this.weatherCodeConvectivo(code)) {
        item.weatherCode = code;
      } else if (Number.isFinite(code) && item.weatherCode === undefined) {
        item.weatherCode = code;
      }
      result.set(fecha, item);
    });
    return result;
  }

  private normalizarOpenMeteoDaily(
    data: any,
    esPronostico: boolean,
  ): ISerieFrioTermicoDia[] {
    const daily = data?.daily || {};
    const fechas: string[] = daily.time || [];
    return fechas.map((fecha, index) => ({
      fecha,
      temperaturaMax: this.round(daily.temperature_2m_max?.[index]),
      temperaturaMin: this.round(daily.temperature_2m_min?.[index]),
      temperaturaMedia: this.round(daily.temperature_2m_mean?.[index]),
      lluvia: this.round(daily.precipitation_sum?.[index] || 0),
      esPronostico,
    }));
  }

  private calcularRiesgoHeladaAgroclimatica(
    serie: ISerieFrioTermicoDia[],
    cultivo?: string,
    contextoCultivo: {
      variedad?: string;
      fechaSiembra?: string;
      etapaFenologica?: string;
    } = {},
  ): IRiesgoAgroclimatico {
    const aplica = esCultivoPerenne(cultivo);
    if (!aplica) {
      return {
        tipo: 'helada',
        aplica: false,
        nivel: 'bajo',
        posibilidadPct: 0,
        titulo: 'Heladas',
        lectura:
          'Servicio de heladas reservado para frutales y cultivos perennes configurados.',
        recomendacion:
          'Para cultivos anuales se mantiene el seguimiento climatico general y alertas de granizo.',
        diasRiesgo: 0,
        evidencia: ['Cultivo sin servicio fenologico de heladas asignado.'],
        serie: [],
      };
    }

    const dias = serie.map((dia) => {
      const contexto = resolverContextoHeladaFenologico({
        cultivo,
        variedad: contextoCultivo.variedad,
        fecha: dia.fecha,
        fechaSiembra: contextoCultivo.fechaSiembra,
        etapaFenologica: contextoCultivo.etapaFenologica,
      });
      const posibilidad = this.posibilidadDanoHelada(
        dia.temperaturaMin,
        contexto?.tempDanoLeveC,
        contexto?.tempDanoSeveroC,
      );
      const nivel: NivelRiesgoAgroclimatico =
        posibilidad >= 70 ? 'alto' : posibilidad >= 35 ? 'medio' : 'bajo';
      const margen =
        dia.temperaturaMin !== undefined &&
        contexto?.tempDanoLeveC !== undefined
          ? this.round(dia.temperaturaMin - contexto.tempDanoLeveC)
          : undefined;
      const evidencia = [
        dia.temperaturaMin !== undefined
          ? `Temperatura minima prevista ${dia.temperaturaMin} C`
          : 'Sin temperatura minima disponible',
        contexto
          ? `Estadio fenologico: ${contexto.etapaDetectada}`
          : 'Sin estadio fenologico disponible',
        contexto?.tempDanoLeveC !== undefined
          ? `Umbral dano inicial ${contexto.tempDanoLeveC} C`
          : 'Sin umbral fenologico disponible',
        contexto?.tempDanoSeveroC !== undefined
          ? `Umbral dano severo ${contexto.tempDanoSeveroC} C`
          : 'Sin umbral severo disponible',
        contexto?.fuente ? `Referencia: ${contexto.fuente}` : '',
      ].filter((item): item is string => !!item);
      return {
        fecha: dia.fecha,
        nivel,
        posibilidadPct: posibilidad,
        temperaturaMin: dia.temperaturaMin,
        temperaturaMax: dia.temperaturaMax,
        lluvia: dia.lluvia,
        etapaFenologica: contexto?.etapaDetectada,
        contextoFenologico: contexto
          ? `${contexto.cultivo} - ${contexto.etapaDetectada}${contexto.variedad ? ` - ${contexto.variedad}` : ''}`
          : undefined,
        umbralDanoLeveC: contexto?.tempDanoLeveC,
        umbralDanoSeveroC: contexto?.tempDanoSeveroC,
        fuenteUmbral: contexto?.fuente,
        margenUmbralC: margen,
        evidencia,
      };
    });
    const critico = [...dias].sort(
      (a, b) => b.posibilidadPct - a.posibilidadPct,
    )[0];
    const diasRiesgo = dias.filter((dia) => dia.nivel !== 'bajo').length;
    const nivel =
      critico?.posibilidadPct >= 70
        ? 'alto'
        : critico?.posibilidadPct >= 35
          ? 'medio'
          : 'bajo';
    return {
      tipo: 'helada',
      aplica: true,
      nivel,
      posibilidadPct: critico?.posibilidadPct || 0,
      titulo: 'Riesgo de dano por helada',
      lectura:
        nivel === 'alto'
          ? `${cultivo} en ${critico?.etapaFenologica || 'estadio sensible'}: temperatura bajo umbral de dano.`
          : nivel === 'medio'
            ? `${cultivo} en ${critico?.etapaFenologica || 'estadio actual'}: escenario cercano al umbral de dano.`
            : `${cultivo}: puede haber frio, pero sin umbral de dano fenologico en los proximos dias.`,
      recomendacion:
        nivel === 'bajo'
          ? 'Mantener seguimiento del pronostico y del estadio fenologico; no activar defensa solo por helada meteorologica.'
          : 'Revisar el estadio real en campo, sensibilidad de yemas/brotes/flores y preparar estrategia de defensa si el lote confirma el estadio sensible.',
      fechaCritica: critico?.fecha,
      etapaFenologica: critico?.etapaFenologica,
      contextoFenologico: critico?.contextoFenologico,
      umbralDanoLeveC: critico?.umbralDanoLeveC,
      umbralDanoSeveroC: critico?.umbralDanoSeveroC,
      fuenteUmbral: critico?.fuenteUmbral,
      diasRiesgo,
      evidencia: critico?.evidencia || [],
      serie: dias,
    };
  }

  private calcularRiesgoGranizo(
    serie: ISerieFrioTermicoDia[],
  ): IRiesgoAgroclimatico {
    const dias = serie.map((dia) => {
      const posibilidad = this.posibilidadGranizo(dia);
      const nivel: NivelRiesgoAgroclimatico =
        posibilidad >= 65 ? 'alto' : posibilidad >= 35 ? 'medio' : 'bajo';
      const evidencia = this.evidenciaGranizo(dia);
      return {
        fecha: dia.fecha,
        nivel,
        posibilidadPct: posibilidad,
        temperaturaMin: dia.temperaturaMin,
        temperaturaMax: dia.temperaturaMax,
        lluvia: dia.lluvia,
        probabilidadLluvia: dia.probabilidadLluvia,
        weatherCode: dia.weatherCode,
        cape: dia.cape,
        showers: dia.showers,
        rafagaViento: dia.rafagaViento,
        evidencia,
      };
    });
    const critico = [...dias].sort(
      (a, b) => b.posibilidadPct - a.posibilidadPct,
    )[0];
    const diasRiesgo = dias.filter((dia) => dia.nivel !== 'bajo').length;
    const nivel =
      critico?.posibilidadPct >= 65
        ? 'alto'
        : critico?.posibilidadPct >= 35
          ? 'medio'
          : 'bajo';
    return {
      tipo: 'granizo',
      aplica: true,
      nivel,
      posibilidadPct: critico?.posibilidadPct || 0,
      titulo: 'Posibilidad de granizo',
      lectura:
        nivel === 'alto'
          ? 'Ventana convectiva compatible con granizo; requiere monitoreo cercano.'
          : nivel === 'medio'
            ? 'Senal convectiva moderada; observar actualizaciones del pronostico.'
            : 'Sin senal convectiva fuerte compatible con granizo.',
      recomendacion:
        nivel === 'bajo'
          ? 'Mantener seguimiento del pronostico local.'
          : 'Revisar cobertura operativa, maquinaria expuesta y recorrida posterior al evento.',
      fechaCritica: critico?.fecha,
      diasRiesgo,
      evidencia: critico?.evidencia || [],
      serie: dias,
    };
  }

  private posibilidadDanoHelada(
    tempMin: number | undefined,
    umbralDanoLeve?: number,
    umbralDanoSevero?: number,
  ): number {
    if (tempMin === undefined || tempMin === null) return 0;
    if (umbralDanoLeve === undefined || umbralDanoSevero === undefined) {
      return 0;
    }
    const puntoMedio = (umbralDanoLeve + umbralDanoSevero) / 2;
    if (tempMin <= umbralDanoSevero) return 95;
    if (tempMin <= puntoMedio) return 75;
    if (tempMin <= umbralDanoLeve) return 50;
    if (tempMin <= umbralDanoLeve + 1) return 25;
    if (tempMin <= umbralDanoLeve + 2) return 10;
    return 5;
  }

  private posibilidadGranizo(dia: ISerieFrioTermicoDia): number {
    let score = 0;
    const code = Number(dia.weatherCode);
    if (code === 96 || code === 99) score += 55;
    else if (code === 95) score += 35;
    else if (this.weatherCodeConvectivo(code)) score += 18;

    const cape = Number(dia.cape || 0);
    if (cape >= 1800) score += 32;
    else if (cape >= 1000) score += 25;
    else if (cape >= 500) score += 15;
    else if (cape >= 250) score += 8;

    const probLluvia = Number(dia.probabilidadLluvia || 0);
    if (probLluvia >= 75) score += 18;
    else if (probLluvia >= 50) score += 12;
    else if (probLluvia >= 30) score += 6;

    const showers = Number(dia.showers || 0);
    if (showers >= 8) score += 15;
    else if (showers >= 3) score += 10;
    else if (showers >= 1) score += 5;

    const rafaga = Number(dia.rafagaViento || 0);
    if (rafaga >= 70) score += 12;
    else if (rafaga >= 45) score += 7;

    if (Number(dia.temperaturaMax || 0) >= 24) score += 4;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private evidenciaGranizo(dia: ISerieFrioTermicoDia): string[] {
    const evidencia: string[] = [];
    if (dia.weatherCode !== undefined) {
      evidencia.push(`Codigo de tiempo ${dia.weatherCode}`);
    }
    if (dia.cape !== undefined) {
      evidencia.push(`Energia convectiva ${dia.cape}`);
    }
    if (dia.probabilidadLluvia !== undefined) {
      evidencia.push(
        `Probabilidad de precipitacion ${dia.probabilidadLluvia}%`,
      );
    }
    if (dia.showers !== undefined) {
      evidencia.push(`Chaparrones previstos ${dia.showers} mm`);
    }
    if (dia.rafagaViento !== undefined) {
      evidencia.push(`Rafagas maximas ${dia.rafagaViento} km/h`);
    }
    return evidencia.length
      ? evidencia
      : ['Sin variables convectivas suficientes para elevar el riesgo.'];
  }

  private weatherCodeConvectivo(code: number): boolean {
    return [80, 81, 82, 95, 96, 99].includes(code);
  }

  private mergeSeries(
    historico: ISerieFrioTermicoDia[],
    forecast: ISerieFrioTermicoDia[],
  ): ISerieFrioTermicoDia[] {
    const byDate = new Map<string, ISerieFrioTermicoDia>();
    historico.forEach((dia) => byDate.set(dia.fecha, dia));
    forecast.forEach((dia) => byDate.set(dia.fecha, dia));
    return [...byDate.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  private getInicioFrio(fecha: Date): Date {
    const year =
      fecha.getMonth() + 1 >= 5 ? fecha.getFullYear() : fecha.getFullYear() - 1;
    return new Date(Date.UTC(year, 4, 1));
  }

  private getInicioTermico(fecha: Date): Date {
    const year =
      fecha.getMonth() + 1 >= 8 ? fecha.getFullYear() : fecha.getFullYear() - 1;
    return new Date(Date.UTC(year, 7, 1));
  }

  private estimarHorasFrio(tempMin?: number, tempMax?: number): number {
    const umbral = 7.2;
    if (tempMin == null || tempMax == null) return 0;
    if (tempMax <= umbral) return 24;
    if (tempMin >= umbral) return 0;
    const rango = Math.max(tempMax - tempMin, 0.1);
    return this.round(((umbral - tempMin) / rango) * 24);
  }

  private estimarHorasFrioEfectivas(tempMedia?: number): number {
    if (tempMedia == null) return 0;
    if (tempMedia >= 2.5 && tempMedia <= 9.1) return 24;
    if (tempMedia > 9.1 && tempMedia <= 12.4) return 12;
    if (tempMedia > 12.4 && tempMedia <= 15.9) return 6;
    if (tempMedia > 18) return -6;
    return 0;
  }

  private estimarGradosDia(
    tempMin?: number,
    tempMax?: number,
    base = 10,
  ): number {
    if (tempMin == null || tempMax == null) return 0;
    return this.round(Math.max((tempMin + tempMax) / 2 - base, 0));
  }

  private getRiesgoHelada(
    serie: ISerieFrioTermicoDia[],
    cultivo?: string,
  ): IFrioTermicoCultivo['riesgoHelada'] {
    const diasEvaluados = serie.map((dia) => {
      const contexto = resolverContextoHeladaFenologico({
        cultivo,
        fecha: dia.fecha,
      });
      const posibilidad = this.posibilidadDanoHelada(
        dia.temperaturaMin,
        contexto?.tempDanoLeveC,
        contexto?.tempDanoSeveroC,
      );
      return {
        ...dia,
        posibilidad,
        etapaFenologica: contexto?.etapaDetectada,
        umbralDanoLeveC: contexto?.tempDanoLeveC,
        umbralDanoSeveroC: contexto?.tempDanoSeveroC,
      };
    });
    const diasRiesgo = diasEvaluados.filter((dia) => dia.posibilidad >= 35);
    const minimo = diasRiesgo.sort(
      (a, b) => (a.temperaturaMin || 0) - (b.temperaturaMin || 0),
    )[0];
    return {
      nivel:
        diasRiesgo.length >= 2
          ? 'alto'
          : diasRiesgo.length === 1
            ? 'medio'
            : 'bajo',
      dias: diasRiesgo.length,
      fechaCritica: minimo?.fecha,
      temperaturaMinima: minimo?.temperaturaMin,
      etapaFenologica: minimo?.etapaFenologica,
      umbralDanoLeveC: minimo?.umbralDanoLeveC,
      umbralDanoSeveroC: minimo?.umbralDanoSeveroC,
    };
  }

  private getEventosFrioTermico(
    progreso: IFrioTermicoCultivo['progreso'],
    riesgoHelada: IFrioTermicoCultivo['riesgoHelada'],
    acumulados: IFrioTermicoCultivo['acumulados'],
  ): IFrioTermicoCultivo['eventos'] {
    const frioCumplido =
      progreso.horasFrioPct >= 85 || progreso.porcionesFrioPct >= 85;
    const brotacionAlcanzada = progreso.brotacionPct >= 100;
    const floracionAlcanzada = progreso.floracionPct >= 100;
    return {
      brotacion: {
        estado: brotacionAlcanzada
          ? 'alcanzada'
          : frioCumplido
            ? progreso.brotacionPct >= 65
              ? 'probable'
              : 'acumulando_calor'
            : 'esperando_frio',
        lectura: frioCumplido
          ? `Frio suficiente o cercano; acumulados ${acumulados.gradosDia} grados dia.`
          : 'Todavia conviene seguir acumulacion de frio antes de estimar brotacion.',
      },
      floracion: {
        estado: floracionAlcanzada
          ? 'alcanzada'
          : progreso.floracionPct >= 70
            ? 'probable'
            : 'pendiente',
        lectura: floracionAlcanzada
          ? 'Floracion termicamente alcanzada para el umbral configurado.'
          : 'Floracion pendiente; usar grados dia y recorrida para ajustar.',
      },
      ventanaSanitaria: {
        estado:
          riesgoHelada.nivel === 'alto'
            ? 'alta'
            : riesgoHelada.nivel === 'medio'
              ? 'media'
              : 'baja',
        lectura:
          riesgoHelada.nivel === 'bajo'
            ? 'Sin dano por helada esperado para el estadio fenologico estimado.'
            : 'Pronostico bajo umbral fenologico: revisar estadio real y proteccion.',
      },
    };
  }

  private getLecturaFrioTermico(
    cultivo: string | undefined,
    progreso: IFrioTermicoCultivo['progreso'],
    riesgoHelada: IFrioTermicoCultivo['riesgoHelada'],
  ): string {
    const nombre = cultivo || 'plantacion';
    if (riesgoHelada.nivel !== 'bajo') {
      return `${nombre}: riesgo de dano por helada para ${riesgoHelada.etapaFenologica || 'el estadio estimado'}; validar a campo antes de activar defensa.`;
    }
    if (progreso.horasFrioPct < 70 && progreso.porcionesFrioPct < 70) {
      return `${nombre}: etapa de acumulacion de frio, sin senal firme de salida de dormancia.`;
    }
    if (progreso.brotacionPct < 100) {
      return `${nombre}: frio cercano a objetivo; seguir grados dia para anticipar brotacion.`;
    }
    return `${nombre}: acumulacion termica suficiente; validar fenologia a campo y ajustar ventana sanitaria.`;
  }

  private entreFechas(fecha: string, desde: string, hasta: string): boolean {
    return fecha >= desde && fecha <= hasta;
  }

  private startOfDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
  }

  private addDays(date: Date, dias: number): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + dias);
    return next;
  }

  private toDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private pct(value?: number, target?: number): number {
    if (!target || !Number.isFinite(target) || !Number.isFinite(value || 0)) {
      return 0;
    }
    return Math.max(
      0,
      Math.min(100, this.round(((value || 0) / target) * 100)),
    );
  }

  private round(value: unknown, digits = 1): number {
    const numberValue = Number(value || 0);
    if (!Number.isFinite(numberValue)) return 0;
    const factor = 10 ** digits;
    return Math.round(numberValue * factor) / factor;
  }
}
