import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  CONFIGURACION_FRIO_CULTIVOS,
  esCultivoPerenne,
  esPlantacionPerenneJoven,
  getEdadPerenneAnios,
  getFenologiaJuvenilPerenne,
  IConfiguracionFrioCultivo,
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

interface IOpenMeteoHourlyTemp {
  time: string;
  temperatura?: number;
  esPronostico: boolean;
}

@Injectable()
export class ClimaService {
  private readonly logger = new Logger(ClimaService.name);
  private readonly timezone = 'America/Argentina/Buenos_Aires';
  private readonly OPEN_METEO_GRANIZO_FUENTE =
    'Open-Meteo forecast: weather_code, CAPE, precipitation_probability, showers y wind_gusts';
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
    contextoHelada: {
      variedad?: string;
      fechaSiembra?: string;
      edadProductivaDesdeAnios?: number;
      ajusteVarietalC?: number;
      fuenteAjusteVarietal?: string;
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
    const requerimientosBase = {
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
    const validacionRequerimientos = this.validarRequerimientosFrio(
      cultivo,
      requerimientosBase,
      config,
    );
    const requerimientos = validacionRequerimientos.requerimientos;
    const edadProductivaDesdeAnios =
      contextoHelada.edadProductivaDesdeAnios ??
      getFenologiaJuvenilPerenne(cultivo)?.edadProductivaDesdeAnios;
    const edadPlantacionAnios = getEdadPerenneAnios(
      contextoHelada.fechaSiembra,
      hoy,
    );
    const plantacionJoven = esPlantacionPerenneJoven(
      cultivo,
      contextoHelada.fechaSiembra,
      hoy,
      edadProductivaDesdeAnios,
    );
    const cacheKey = this.getFrioTermicoCacheKey(
      latNum,
      lngNum,
      cultivo,
      requerimientos,
      contextoHelada,
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
    let calculoPorciones: 'dinamico_horario' | 'estimado_hfe' =
      'dinamico_horario';
    const observacionesCalculo: string[] = [
      ...validacionRequerimientos.observaciones,
    ];
    let porcionesFrioPorDia = new Map<string, number>();
    try {
      const hourlyHistorico = await this.fetchOpenMeteoHourlyArchive(
        latNum,
        lngNum,
        this.toDateKey(frioDesde),
        this.toDateKey(historicoHasta),
      );
      const hourlyForecast = await this.fetchOpenMeteoHourlyForecast(latNum, lngNum);
      const hourlyFrio = this.mergeHourlySeries(hourlyHistorico, hourlyForecast).filter(
        (hora) =>
          this.entreFechas(
            hora.time.slice(0, 10),
            this.toDateKey(frioDesde),
            this.toDateKey(hoy),
          ),
      );
      porcionesFrioPorDia = this.calcularPorcionesFrioDinamicoPorDia(hourlyFrio);
      if (!porcionesFrioPorDia.size) {
        throw new Error('Open-Meteo no devolvio temperaturas horarias utiles.');
      }
    } catch (error: any) {
      calculoPorciones = 'estimado_hfe';
      observacionesCalculo.push(
        'CP estimado desde HFE por falta de serie horaria completa.',
      );
      this.logger.warn(
        `Frio termico sin CP dinamico horario (${latNum}, ${lngNum}): ${error?.message || error}`,
      );
    }
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
      const porcionesFrio =
        calculoPorciones === 'dinamico_horario'
          ? this.round(porcionesFrioPorDia.get(dia.fecha) || 0, 3)
          : this.round(horasFrioEfectivas / 28, 3);
      return {
        ...dia,
        horasFrio,
        horasFrioEfectivas,
        porcionesFrio,
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
      porcionesFrio: this.round(
        frioSerie.reduce((acc, dia) => acc + (dia.porcionesFrio || 0), 0),
        2,
      ),
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
    const riesgoHelada = this.getRiesgoHelada(
      forecast,
      cultivo,
      contextoHelada,
    );
    const eventos = this.getEventosFrioTermico(
      progreso,
      riesgoHelada,
      acumulados,
      plantacionJoven,
    );
    const contextoCultivo: IFrioTermicoCultivo['contextoCultivo'] = {
      plantacionJoven,
      edadPlantacionAnios,
      edadProductivaDesdeAnios,
      lectura: plantacionJoven
        ? `${cultivo || 'Plantacion'} joven: el frio acumulado se usa para dormancia y brotacion vegetativa; no habilita lectura de floracion, llenado o cosecha.`
        : undefined,
    };

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
      calculo: {
        porcionesFrio: calculoPorciones,
        observaciones: observacionesCalculo,
      },
      contextoCultivo,
      serie,
      lectura: this.getLecturaFrioTermico(
        cultivo,
        progreso,
        riesgoHelada,
        plantacionJoven,
      ),
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
      edadProductivaDesdeAnios?: number;
      ajusteVarietalC?: number;
      fuenteAjusteVarietal?: string;
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
    contextoHelada: {
      variedad?: string;
      fechaSiembra?: string;
      edadProductivaDesdeAnios?: number;
      ajusteVarietalC?: number;
      fuenteAjusteVarietal?: string;
    } = {},
  ): string {
    const req = Object.entries(requerimientos)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value ?? ''}`)
      .join('|');
    return [
      this.round(lat, 4),
      this.round(lng, 4),
      cultivo || 'cultivo',
      contextoHelada.variedad || 'variedad',
      contextoHelada.fechaSiembra || 'fecha',
      contextoHelada.edadProductivaDesdeAnios ?? '',
      contextoHelada.ajusteVarietalC ?? '',
      contextoHelada.fuenteAjusteVarietal || '',
      this.toDateKey(new Date()),
      req,
    ].join('|');
  }

  private validarRequerimientosFrio(
    cultivo: string | undefined,
    requerimientos: IFrioTermicoCultivo['requerimientos'],
    config: IConfiguracionFrioCultivo,
  ): {
    requerimientos: IFrioTermicoCultivo['requerimientos'];
    observaciones: string[];
  } {
    const normalizado = (cultivo || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    const resultado = { ...requerimientos };
    const observaciones: string[] = [];

    if (normalizado !== 'pecan') {
      return { requerimientos: resultado, observaciones };
    }

    if (
      this.fueraDeRango(resultado.horasFrioObjetivo, 100, 1200) &&
      Number.isFinite(config.horasFrioObjetivo)
    ) {
      observaciones.push(
        `HF objetivo ${resultado.horasFrioObjetivo} fuera de rango para Pecan; se uso base ${config.horasFrioObjetivo}.`,
      );
      resultado.horasFrioObjetivo = config.horasFrioObjetivo;
    }

    if (
      this.fueraDeRango(resultado.horasFrioEfectivasObjetivo, 80, 1000) &&
      Number.isFinite(config.horasFrioEfectivasObjetivo)
    ) {
      observaciones.push(
        `HFE objetivo ${resultado.horasFrioEfectivasObjetivo} fuera de rango para Pecan; se uso base ${config.horasFrioEfectivasObjetivo}.`,
      );
      resultado.horasFrioEfectivasObjetivo =
        config.horasFrioEfectivasObjetivo;
    }

    if (
      this.fueraDeRango(resultado.porcionesFrioObjetivo, 5, 80) &&
      Number.isFinite(config.porcionesFrioObjetivo)
    ) {
      observaciones.push(
        `CP objetivo ${resultado.porcionesFrioObjetivo} fuera de rango para Pecan; se uso base ${config.porcionesFrioObjetivo}.`,
      );
      resultado.porcionesFrioObjetivo = config.porcionesFrioObjetivo;
    }

    return { requerimientos: resultado, observaciones };
  }

  private fueraDeRango(
    valor: number | undefined,
    minimo: number,
    maximo: number,
  ): boolean {
    if (!Number.isFinite(valor)) return false;
    return Number(valor) < minimo || Number(valor) > maximo;
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

  private async fetchOpenMeteoHourlyArchive(
    lat: number,
    lng: number,
    from: string,
    to: string,
  ): Promise<IOpenMeteoHourlyTemp[]> {
    if (from > to) return [];
    const url = 'https://archive-api.open-meteo.com/v1/archive';
    const response = await firstValueFrom(
      this.httpService.get(url, {
        params: {
          latitude: lat,
          longitude: lng,
          start_date: from,
          end_date: to,
          hourly: 'temperature_2m',
          timezone: this.timezone,
        },
        timeout: 16000,
      }),
    );
    return this.normalizarOpenMeteoHourlyTemperature(response.data, false);
  }

  private async fetchOpenMeteoHourlyForecast(
    lat: number,
    lng: number,
  ): Promise<IOpenMeteoHourlyTemp[]> {
    const url = 'https://api.open-meteo.com/v1/forecast';
    const response = await firstValueFrom(
      this.httpService.get(url, {
        params: {
          latitude: lat,
          longitude: lng,
          forecast_days: 16,
          hourly: 'temperature_2m',
          timezone: this.timezone,
        },
        timeout: 12000,
      }),
    );
    return this.normalizarOpenMeteoHourlyTemperature(response.data, true);
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

  private normalizarOpenMeteoHourlyTemperature(
    data: any,
    esPronostico: boolean,
  ): IOpenMeteoHourlyTemp[] {
    const hourly = data?.hourly || {};
    const times: string[] = hourly.time || [];
    return times
      .map((time, index) => ({
        time,
        temperatura: this.round(hourly.temperature_2m?.[index], 3),
        esPronostico,
      }))
      .filter((item) => !!item.time && Number.isFinite(item.temperatura));
  }

  private mergeHourlySeries(
    historico: IOpenMeteoHourlyTemp[],
    forecast: IOpenMeteoHourlyTemp[],
  ): IOpenMeteoHourlyTemp[] {
    const byTime = new Map<string, IOpenMeteoHourlyTemp>();
    historico.forEach((hora) => byTime.set(hora.time, hora));
    forecast.forEach((hora) => byTime.set(hora.time, hora));
    return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
  }

  private calcularPorcionesFrioDinamicoPorDia(
    serieHoraria: IOpenMeteoHourlyTemp[],
  ): Map<string, number> {
    const serie = serieHoraria.filter((hora) =>
      Number.isFinite(hora.temperatura),
    );
    const resultado = new Map<string, number>();
    if (serie.length < 2) return resultado;

    const e0 = 4153.5;
    const e1 = 12888.8;
    const a0 = 139500;
    const a1 = 2567000000000000000;
    const slope = 1.6;
    const tf = 277;
    const aa = a0 / a1;
    const ee = e1 - e0;
    const xi: number[] = [];
    const xs: number[] = [];
    const eak1: number[] = [];

    serie.forEach((hora) => {
      const tk = Number(hora.temperatura) + 273;
      const sr = Math.exp((slope * tf * (tk - tf)) / tk);
      xi.push(sr / (1 + sr));
      xs.push(aa * Math.exp(ee / tk));
      eak1.push(Math.exp(-a1 * Math.exp(-e1 / tk)));
    });

    const x = new Array<number>(serie.length).fill(0);
    for (let index = 1; index < serie.length; index += 1) {
      let s = x[index - 1];
      if (x[index - 1] >= 1) {
        s *= 1 - (xi[index - 2] || 0);
      }
      x[index] = xs[index - 1] - (xs[index - 1] - s) * eak1[index - 1];
    }

    x.forEach((valor, index) => {
      if (valor < 1 || index === 0) return;
      const delta = valor * (xi[index - 1] || 0);
      if (!Number.isFinite(delta) || delta <= 0) return;
      const fecha = serie[index].time.slice(0, 10);
      resultado.set(fecha, (resultado.get(fecha) || 0) + delta);
    });

    for (const [fecha, valor] of resultado.entries()) {
      resultado.set(fecha, this.round(valor, 3));
    }
    return resultado;
  }

  private calcularRiesgoHeladaAgroclimatica(
    serie: ISerieFrioTermicoDia[],
    cultivo?: string,
    contextoCultivo: {
      variedad?: string;
      fechaSiembra?: string;
      etapaFenologica?: string;
      edadProductivaDesdeAnios?: number;
      ajusteVarietalC?: number;
      fuenteAjusteVarietal?: string;
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
        edadProductivaDesdeAnios: contextoCultivo.edadProductivaDesdeAnios,
        ajusteVarietalC: contextoCultivo.ajusteVarietalC,
        fuenteAjusteVarietal: contextoCultivo.fuenteAjusteVarietal,
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
        contexto?.calibracionVarietal === 'base_fenologica'
          ? 'Calibracion: base fenologica'
          : `Calibracion varietal: ${contexto?.fuenteAjusteVarietal || 'ajuste cargado'}`,
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
        calibracionVarietal: contexto?.calibracionVarietal,
        ajusteVarietalC: contexto?.ajusteVarietalC,
        fuenteAjusteVarietal: contexto?.fuenteAjusteVarietal,
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
      calibracionVarietal: critico?.calibracionVarietal,
      ajusteVarietalC: critico?.ajusteVarietalC,
      fuenteAjusteVarietal: critico?.fuenteAjusteVarietal,
      diasRiesgo,
      evidencia: critico?.evidencia || [],
      serie: dias,
    };
  }

  private calcularRiesgoGranizo(
    serie: ISerieFrioTermicoDia[],
  ): IRiesgoAgroclimatico {
    const dias = serie.map((dia) => {
      const evaluacion = this.evaluarGranizoAgroclimatico(dia);
      const posibilidad = evaluacion.posibilidadPct;
      const nivel: NivelRiesgoAgroclimatico =
        posibilidad >= 65 ? 'alto' : posibilidad >= 35 ? 'medio' : 'bajo';
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
        evidencia: evaluacion.evidencia,
        calidadDatos: evaluacion.calidadDatos,
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
      titulo: 'Riesgo estimado de granizo',
      lectura:
        nivel === 'alto'
          ? 'Ventana convectiva compatible con granizo; requiere monitoreo cercano y validacion meteorologica local.'
          : nivel === 'medio'
            ? 'Senal convectiva moderada; observar actualizaciones del pronostico y radar disponible.'
            : 'Sin senal humeda/convectiva suficiente para elevar riesgo de granizo.',
      recomendacion:
        nivel === 'bajo'
          ? 'Mantener seguimiento del pronostico local; no activar acciones por granizo sin lluvia o tormenta confirmada.'
          : 'Revisar cobertura operativa, maquinaria expuesta y recorrida posterior al evento.',
      fechaCritica: critico?.fecha,
      diasRiesgo,
      evidencia: critico?.evidencia || [],
      calidadDatos: critico?.calidadDatos,
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

  private evaluarGranizoAgroclimatico(
    dia: ISerieFrioTermicoDia,
  ): {
    posibilidadPct: number;
    evidencia: string[];
    calidadDatos: NonNullable<IRiesgoAgroclimatico['calidadDatos']>;
  } {
    let score = 0;
    const evidencia: string[] = [];
    const code = Number(dia.weatherCode);
    const lluvia = this.toFiniteNumber(dia.lluvia);
    const probLluvia = this.toFiniteNumber(dia.probabilidadLluvia);
    const showers = this.toFiniteNumber(dia.showers);
    const cape = this.toFiniteNumber(dia.cape);
    const rafaga = this.toFiniteNumber(dia.rafagaViento);
    const tempMax = this.toFiniteNumber(dia.temperaturaMax);

    const codeHail = code === 96 || code === 99;
    const codeTormenta = this.weatherCodeTormenta(code);
    const codeChaparron = this.weatherCodeChaparron(code);
    const precipitacionActiva = lluvia >= 1 || showers >= 0.5;
    const probabilidadAlta = probLluvia >= 45;
    const soportePrecipitacion = lluvia >= 0.5 || showers >= 0.2;
    const disparoHumedo = precipitacionActiva || probabilidadAlta;

    if (Number.isFinite(code)) evidencia.push(`Codigo de tiempo ${code}`);

    if (codeHail) {
      score += 30;
      evidencia.push(
        'Codigo de tormenta con granizo usado como proxy; requiere validacion local/radar.',
      );
    } else if (code === 95) {
      score += 22;
      evidencia.push('Codigo de tormenta sin granizo explicito.');
    } else if (code === 82) {
      score += 14;
      evidencia.push('Codigo de chaparron violento.');
    } else if (code === 81) {
      score += 10;
      evidencia.push('Codigo de chaparron moderado.');
    } else if (code === 80) {
      score += 6;
      evidencia.push('Codigo de chaparron leve.');
    }

    if (cape >= 2000) score += 26;
    else if (cape >= 1000) score += 18;
    else if (cape >= 500) score += 10;
    else if (cape >= 250) score += 4;
    if (dia.cape !== undefined) {
      evidencia.push(`Energia convectiva CAPE ${Math.round(cape)}`);
    }

    if (lluvia >= 20) score += 12;
    else if (lluvia >= 10) score += 8;
    else if (lluvia >= 3) score += 4;
    if (dia.lluvia !== undefined) evidencia.push(`Lluvia prevista ${lluvia} mm`);

    if (probLluvia >= 75) score += 15;
    else if (probLluvia >= 50) score += 10;
    else if (probLluvia >= 30) score += 5;
    if (dia.probabilidadLluvia !== undefined) {
      evidencia.push(`Probabilidad de precipitacion ${probLluvia}%`);
    }

    if (showers >= 8) score += 15;
    else if (showers >= 3) score += 10;
    else if (showers >= 0.5) score += 4;
    if (dia.showers !== undefined) {
      evidencia.push(`Chaparrones previstos ${showers} mm`);
    }

    if (rafaga >= 70) score += 8;
    else if (rafaga >= 50) score += 5;
    if (dia.rafagaViento !== undefined) {
      evidencia.push(`Rafagas maximas ${rafaga} km/h`);
    }

    if (tempMax >= 24 && (codeTormenta || cape >= 250)) score += 3;

    if (!disparoHumedo && !codeTormenta) {
      score = Math.min(score, cape >= 500 ? 8 : 5);
      evidencia.push(
        'Sin lluvia/chaparrones suficientes: Chaman limita el riesgo para evitar falso positivo.',
      );
    } else if (!disparoHumedo && codeTormenta) {
      score = Math.min(score, codeHail ? 24 : 16);
      evidencia.push(
        'Hay senal de tormenta, pero falta soporte de lluvia; se informa como vigilancia, no alarma fuerte.',
      );
    } else if (codeChaparron && lluvia < 0.5 && showers < 0.5 && probLluvia < 30) {
      score = Math.min(score, 6);
      evidencia.push(
        'Codigo convectivo aislado sin precipitacion asociada; lectura corregida.',
      );
    }

    if (!soportePrecipitacion && codeTormenta) {
      score = Math.min(score, codeHail ? 15 : 10);
      evidencia.push(
        'Tormenta sin volumen de lluvia/chaparron previsto: se informa como vigilancia residual.',
      );
    } else if (!soportePrecipitacion && probabilidadAlta) {
      score = Math.min(score, 12);
      evidencia.push(
        'Probabilidad de precipitacion sin volumen previsto: no se eleva riesgo de granizo sin soporte humedo.',
      );
    }

    const soportes = [
      codeTormenta,
      codeChaparron && disparoHumedo,
      cape >= 500,
      probabilidadAlta,
      precipitacionActiva,
      rafaga >= 50,
    ].filter(Boolean).length;
    const variables = [
      dia.weatherCode !== undefined,
      dia.cape !== undefined,
      dia.probabilidadLluvia !== undefined,
      dia.showers !== undefined,
      dia.rafagaViento !== undefined,
      dia.lluvia !== undefined,
    ].filter(Boolean).length;
    const calidadScore = Math.round(
      Math.min(100, (variables / 6) * 45 + Math.min(soportes, 5) * 11),
    );
    const nivel =
      variables === 0
        ? 'sin_datos'
        : disparoHumedo && soportes >= 3 && variables >= 4
          ? 'media'
          : 'baja';

    return {
      posibilidadPct: Math.max(0, Math.min(100, Math.round(score))),
      evidencia: evidencia.length
        ? evidencia
        : ['Sin variables convectivas suficientes para elevar el riesgo.'],
      calidadDatos: {
        nivel,
        score: calidadScore,
        fuente: this.OPEN_METEO_GRANIZO_FUENTE,
        detalle:
          nivel === 'media'
            ? 'Multiples proxies convectivos respaldan el riesgo; no reemplaza radar ni alerta oficial.'
            : 'Lectura preventiva con soporte limitado; requiere validar pronostico local antes de accionar.',
      },
    };
  }

  private weatherCodeTormenta(code: number): boolean {
    return [95, 96, 99].includes(code);
  }

  private weatherCodeChaparron(code: number): boolean {
    return [80, 81, 82].includes(code);
  }

  private weatherCodeConvectivo(code: number): boolean {
    return this.weatherCodeTormenta(code) || this.weatherCodeChaparron(code);
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
    contextoHelada: {
      variedad?: string;
      fechaSiembra?: string;
      edadProductivaDesdeAnios?: number;
      ajusteVarietalC?: number;
      fuenteAjusteVarietal?: string;
    } = {},
  ): IFrioTermicoCultivo['riesgoHelada'] {
    const diasEvaluados = serie.map((dia) => {
      const contexto = resolverContextoHeladaFenologico({
        cultivo,
        fecha: dia.fecha,
        variedad: contextoHelada.variedad,
        fechaSiembra: contextoHelada.fechaSiembra,
        edadProductivaDesdeAnios: contextoHelada.edadProductivaDesdeAnios,
        ajusteVarietalC: contextoHelada.ajusteVarietalC,
        fuenteAjusteVarietal: contextoHelada.fuenteAjusteVarietal,
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
    plantacionJoven = false,
  ): IFrioTermicoCultivo['eventos'] {
    const frioCumplido =
      progreso.horasFrioPct >= 85 ||
      progreso.horasFrioEfectivasPct >= 85 ||
      progreso.porcionesFrioPct >= 85;
    const brotacionAlcanzada = frioCumplido && progreso.brotacionPct >= 100;
    const floracionAlcanzada = progreso.floracionPct >= 100;
    if (plantacionJoven) {
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
            ? `Frio de dormancia suficiente o cercano; ${acumulados.gradosDia} grados dia acumulados para brotacion vegetativa.`
            : 'Seguir acumulacion de frio de dormancia antes de anticipar brotacion vegetativa.',
        },
        floracion: {
          estado: 'pendiente',
          lectura:
            'No se proyecta floracion, llenado ni cosecha en plantacion joven sin confirmacion de entrada productiva.',
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
              ? 'Sin dano por helada esperado para el estadio vegetativo estimado.'
              : 'Revisar brotes/yemas jovenes a campo antes de activar defensa.',
        },
      };
    }
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
    plantacionJoven = false,
  ): string {
    const nombre = cultivo || 'plantacion';
    const frioDormanciaBajo =
      progreso.horasFrioPct < 70 &&
      progreso.horasFrioEfectivasPct < 70 &&
      progreso.porcionesFrioPct < 70;
    if (plantacionJoven) {
      if (riesgoHelada.nivel !== 'bajo') {
        return `${nombre} joven: riesgo de dano por helada en yemas o brotes vegetativos; validar estado real antes de activar defensa.`;
      }
      if (frioDormanciaBajo) {
        return `${nombre} joven: acumulacion de frio de dormancia en seguimiento; no es una lectura de floracion ni cosecha.`;
      }
      if (progreso.brotacionPct < 100) {
        return `${nombre} joven: frio de dormancia suficiente o cercano; seguir grados dia para brotacion vegetativa.`;
      }
      return `${nombre} joven: dormancia y calor acumulados compatibles con brotacion vegetativa; validar a campo.`;
    }
    if (riesgoHelada.nivel !== 'bajo') {
      return `${nombre}: riesgo de dano por helada para ${riesgoHelada.etapaFenologica || 'el estadio estimado'}; validar a campo antes de activar defensa.`;
    }
    if (frioDormanciaBajo) {
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

  private toFiniteNumber(value: unknown): number {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }
}
