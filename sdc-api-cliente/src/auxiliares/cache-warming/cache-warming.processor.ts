import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { IPermiso, ICoordenadas } from 'modelos/src';
import { ICacheWarmingJob } from './cache-warming-queue.service';
import { EstablecimientosService } from '../../entidades/establecimiento/service';
import { TileCalculationService } from '../tile-calculation/tile-calculation.service';
import { TileCacheService } from '../tile-cache/tile-cache.service';
import { API_CLIMA } from '../../env';

@Processor('cache-warming')
export class CacheWarmingProcessor {
  private readonly logger = new Logger(CacheWarmingProcessor.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly establecimientosService: EstablecimientosService,
    private readonly tileCalculationService: TileCalculationService,
    private readonly tileCacheService: TileCacheService,
  ) {}

  @Process('warm-user-login')
  async handleCacheWarming(job: Job<ICacheWarmingJob>) {
    const { userId, permisos, variables, zoomLevels, loginTime, source } =
      job.data;

    this.logger.log(
      `🔥 Iniciando cache warming para usuario: ${userId} (${source})`,
    );

    try {
      // 1. Obtener establecimientos del usuario usando el service (maneja permisos automáticamente)
      const establecimientosData =
        await this.getEstablecimientosWithPermisos(permisos);

      this.logger.debug(
        `👤 Usuario ${userId} tiene acceso a ${establecimientosData.length} establecimientos`,
      );

      // 2. Obtener coordenadas de polígonos de los establecimientos (método unificado)
      const establecimientoCoords =
        this.tileCalculationService.extractUbicacionesFromEstablecimientos(
          establecimientosData,
        );

      this.logger.debug(
        `📍 Obtenidas ${establecimientoCoords.length} ubicaciones de establecimientos`,
      );

      // 3. Generar tiles para cada ubicación de establecimiento y zoom level
      let totalProcessed = 0;
      let totalDownloaded = 0;
      let totalCacheHits = 0;

      for (let i = 0; i < establecimientoCoords.length; i++) {
        const ubicacion = establecimientoCoords[i];
        for (const zoom of zoomLevels) {
          const stats = await this.warmTilesForPoligono(
            ubicacion.poligono,
            variables,
            zoom,
            `ubicacion-${i}`,
          );

          totalProcessed += stats.processed;
          totalDownloaded += stats.downloaded;
          totalCacheHits += stats.cacheHits;

          // Pequeña pausa entre zoom levels para no sobrecargar
          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        // Pausa entre establecimientos
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const cacheHitRate =
        totalProcessed > 0
          ? ((totalCacheHits / totalProcessed) * 100).toFixed(1)
          : '0.0';

      this.logger.log(
        `✅ Cache warming completado para usuario ${userId}: ${totalProcessed} tiles procesados (${totalDownloaded} descargados, ${totalCacheHits} cache hits = ${cacheHitRate}% hit rate)`,
      );

      // Actualizar progreso del job
      await job.progress(100);

      return {
        success: true,
        userId,
        ubicacionesProcessed: establecimientoCoords.length,
        establecimientosUnicos: establecimientosData.length,
        tilesProcessed: totalProcessed,
        tilesDownloaded: totalDownloaded,
        cacheHits: totalCacheHits,
        cacheHitRate: `${cacheHitRate}%`,
        processingTime: Date.now() - new Date(loginTime).getTime(),
      };
    } catch (error) {
      this.logger.error(
        `❌ Error en cache warming para usuario ${userId}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Obtiene establecimientos usando el service que maneja permisos automáticamente
   */
  private async getEstablecimientosWithPermisos(permisos: IPermiso[]) {
    // Usar el primer permiso para hacer la consulta
    // El service maneja automáticamente los filtros según el nivel de permiso
    const permiso = permisos[0];

    if (!permiso) {
      this.logger.warn(
        '� Usuario sin permisos, no se pueden obtener establecimientos',
      );
      return [];
    }

    try {
      const query = {
        page: 0,
        limit: 0, // Sin límite para obtener todos
        select: '_id ubicacion',
      };

      this.logger.debug(
        `🔍 Consultando establecimientos con permiso nivel: ${permiso.nivel}`,
      );

      const resultado = await this.establecimientosService.get(query, permiso);

      this.logger.debug(
        `� Establecimientos obtenidos: ${resultado.datos.length}`,
      );

      return resultado.datos;
    } catch (error) {
      this.logger.error(
        `❌ Error obteniendo establecimientos: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Genera tiles que intersectan con un polígono para múltiples horas
   */
  private async warmTilesForPoligono(
    poligono: ICoordenadas[],
    variables: string[],
    zoom: number,
    locationId: string = 'unknown',
  ): Promise<{ processed: number; downloaded: number; cacheHits: number }> {
    let tilesProcessed = 0;
    let tilesDownloaded = 0;
    let cacheHits = 0;

    try {
      // Calcular tiles que intersectan con el polígono
      const tileCoords =
        this.tileCalculationService.calculateTilesIntersectingPolygon(
          poligono,
          zoom,
        );

      this.logger.debug(
        `🔍 Calculados ${tileCoords.length} tiles intersectando con polígono ${locationId}`,
      );

      // Generar tiles para hora actual y siguiente para cubrir transiciones horarias
      const now = new Date();
      const currentHour = new Date(now);
      currentHour.setHours(now.getHours(), 0, 0, 0);

      const nextHour = new Date(now);
      nextHour.setHours(now.getHours() + 1, 0, 0, 0);

      // Usar tanto 'now' como timestamps específicos para mejor cobertura
      const dateVariants = [
        'now', // Para solicitudes inmediatas
        currentHour.toISOString().slice(0, 13) + ':00', // Hora actual exacta
        nextHour.toISOString().slice(0, 13) + ':00', // Hora siguiente
      ];

      this.logger.debug(
        `🔥 Cache warming configurado para ${dateVariants.length} variantes temporales: ${dateVariants.join(', ')}`,
      );

      // Generar tiles para cada variable climática y cada variante de tiempo
      for (const variable of variables) {
        for (const dateVariant of dateVariants) {
          for (const coord of tileCoords) {
            try {
              const wasDownloaded = await this.requestTileWithTime(
                coord.x,
                coord.y,
                zoom,
                variable,
                dateVariant,
              );
              tilesProcessed++;

              if (wasDownloaded) {
                tilesDownloaded++;
              } else {
                cacheHits++;
              }

              // Pausa pequeña entre requests para evitar rate limiting
              await new Promise((resolve) => setTimeout(resolve, 100));
            } catch {
              // Error individual silencioso - se reporta en estadísticas finales
            }
          }
        }
      }

      this.logger.log(
        `🏢 Ubicación ${locationId}: ${tilesProcessed} tiles procesados, ${tilesDownloaded} descargados, ${cacheHits} cache hits (${Math.round((cacheHits / tilesProcessed) * 100)}% hit rate)`,
      );
    } catch (error) {
      this.logger.warn(
        `⚠️ Error generando tiles para ubicación ${locationId}: ${error.message}`,
      );
    }

    return {
      processed: tilesProcessed,
      downloaded: tilesDownloaded,
      cacheHits,
    };
  }

  /**
   * Solicita un tile específico con tiempo específico
   */
  private async requestTileWithTime(
    x: number,
    y: number,
    z: number,
    variable: string,
    datetime: string = 'now',
  ): Promise<boolean> {
    try {
      // 🔍 PASO 1: Verificar si el tile ya está en cache
      // IMPORTANTE: TileCacheService normaliza internamente datetime
      const cachedTile = await this.tileCacheService.getTile(
        variable,
        datetime,
        x,
        y,
        z,
      );

      if (cachedTile) {
        // ✅ Tile ya existe en cache, no necesitamos descargarlo
        return false; // No se descargó porque ya existía
      }

      // 🌐 PASO 2: Tile no está en cache, descargarlo desde la API
      const tileUrl = `${API_CLIMA}/meteoSource/tiles/${variable}/${datetime}/${x}/${y}/${z}`;

      const response = await lastValueFrom(
        this.httpService.get(tileUrl, {
          responseType: 'arraybuffer',
          timeout: 5000, // 5 segundos timeout
        }),
      );

      // 💾 PASO 3: Guardar el tile descargado en cache para futuras consultas
      const tileData = Buffer.from(response.data);
      await this.tileCacheService.setTile(
        variable,
        datetime,
        x,
        y,
        z,
        tileData,
        'image/png',
      );

      this.logger.debug(
        `💾 Tile cacheado: ${x}:${y}:${z}:${variable} (${tileData.length} bytes)`,
      );

      return true; // Se descargó y cacheó exitosamente
    } catch (error) {
      // Error específico, lo relanzamos para el manejo superior
      throw new Error(
        `Tile request failed: ${x}/${y}/${z}/${variable}/${datetime} - ${error.message}`,
      );
    }
  }

  /**
   * Realiza request de un tile específico a la API de clima
   * SOLO si no está ya en cache (optimización inteligente)
   */
  private async requestTile(
    x: number,
    y: number,
    z: number,
    variable: string,
  ): Promise<boolean> {
    try {
      const datetime = 'now'; // Usar datos actuales por defecto

      // 🔍 PASO 1: Verificar si el tile ya está en cache
      const cachedTile = await this.tileCacheService.getTile(
        variable,
        datetime,
        x,
        y,
        z,
      );

      if (cachedTile) {
        // ✅ Tile ya existe en cache, no necesitamos descargarlo
        return false; // No se descargó porque ya existía
      }

      // 🌐 PASO 2: Tile no está en cache, descargarlo desde la API
      const tileUrl = `${API_CLIMA}/meteoSource/tiles/${variable}/${datetime}/${x}/${y}/${z}`;

      const response = await lastValueFrom(
        this.httpService.get(tileUrl, {
          responseType: 'arraybuffer',
          timeout: 5000, // 5 segundos timeout
        }),
      );

      // 💾 PASO 3: Guardar el tile descargado en cache para futuras consultas
      const tileData = Buffer.from(response.data);
      await this.tileCacheService.setTile(
        variable,
        datetime,
        x,
        y,
        z,
        tileData,
        'image/png',
      );

      return true; // Se descargó y cacheó exitosamente
    } catch (error) {
      // Error específico, lo relanzamos para el manejo superior
      throw new Error(
        `Tile request failed: ${x}/${y}/${z}/${variable} - ${error.message}`,
      );
    }
  }
}
