import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { IPermiso } from 'modelos/src';
import { ENV } from '../../env';

export interface ICacheWarmingJob {
  userId: string;
  permisos: IPermiso[];
  variables: string[];
  zoomLevels: number[]; // Cambiado de zoom: number a zoomLevels: number[]
  loginTime: string;
  source: 'user-login' | 'refresh-token' | 'google-login';
}

@Injectable()
export class CacheWarmingQueueService {
  private readonly logger = new Logger(CacheWarmingQueueService.name);
  private readonly loginDedupeWindowMs = (() => {
    const seconds = Number(process.env.CACHE_WARM_LOGIN_DEDUPE_SECONDS);
    return Number.isInteger(seconds) && seconds >= 30 && seconds <= 3600
      ? seconds * 1000
      : 300_000;
  })();
  private readonly scheduledLoginWarmings = new Map<string, number>();
  private readonly maxScheduledLoginWarmings = 5000;

  constructor(@InjectQueue('cache-warming') private cacheWarmingQueue: Queue) {
    this.logger.log('🔧 CacheWarmingQueueService initialized');
  }

  /**
   * Cache warming específico post-login
   */
  async warmTilesForUserLogin(
    userId: string,
    permisos: IPermiso[],
    source: 'user-login' | 'refresh-token' | 'google-login' = 'user-login',
  ): Promise<void> {
    try {
      if (source === 'refresh-token') {
        this.logger.debug(
          `Cache warming omitido para refresh token: ${userId}`,
        );
        return;
      }

      if (ENV === 'local') {
        this.logger.log(
          `Cache warming omitido en entorno local para usuario: ${userId}`,
        );
        return;
      }

      this.logger.log(`🚀 Iniciando cache warming para usuario: ${userId}`);

      if (!this.cacheWarmingQueue) {
        throw new Error('Cache warming queue not initialized');
      }

      this.logger.log(`📊 Queue status check...`);

      // Variables más críticas para precarga inmediata
      const criticalVariables = ['temperature', 'precipitation'];

      // Zoom levels comunes que usa el frontend
      const commonZoomLevels = [8, 12, 14];

      const now = Date.now();
      const dedupeWindow = Math.floor(now / this.loginDedupeWindowMs);
      const safeUserId = String(userId)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 80);
      const jobId = `cache-warm-login-${safeUserId}-${dedupeWindow}`;
      this.pruneScheduledLoginWarmings(now);
      if (this.scheduledLoginWarmings.has(jobId)) {
        this.logger.debug(
          `Cache warming ya programado en esta ventana: ${userId}`,
        );
        return;
      }
      this.makeRoomForScheduledLoginWarming();
      this.scheduledLoginWarmings.set(
        jobId,
        (dedupeWindow + 1) * this.loginDedupeWindowMs,
      );

      const jobData: ICacheWarmingJob = {
        userId,
        permisos,
        variables: criticalVariables,
        zoomLevels: commonZoomLevels, // Array de zoom levels
        loginTime: new Date(now).toISOString(),
        source,
      };

      const jobOptions = {
        priority: 3, // Prioridad media-alta
        delay: 2000, // 2 segundos delay para no interferir con respuesta de login
        attempts: 2,
        backoff: {
          type: 'exponential' as const,
          delay: 5000, // 5 segundos base para retry
        },
        removeOnComplete: 10, // Mantener últimos 10 jobs completados
        removeOnFail: 5, // Mantener últimos 5 jobs fallidos
      };

      this.logger.log(`📋 Intentando agregar job a cola: ${jobId}`);

      let job;
      try {
        job = await this.cacheWarmingQueue.add(
          'warm-user-login',
          jobData,
          {
            ...jobOptions,
            jobId,
          },
        );
      } catch (error) {
        this.scheduledLoginWarmings.delete(jobId);
        throw error;
      }

      this.logger.log(`✅ Job agregado exitosamente: ${job.id}`);
      this.logger.log(
        `🔥 Cache warming programado para usuario: ${userId} (${source})`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Error programando cache warming para usuario ${userId}:`,
        error.message,
      );
      throw error;
    }
  }

  private pruneScheduledLoginWarmings(now: number): void {
    for (const [key, expiresAt] of this.scheduledLoginWarmings) {
      if (expiresAt <= now) {
        this.scheduledLoginWarmings.delete(key);
      }
    }
  }

  private makeRoomForScheduledLoginWarming(): void {
    while (
      this.scheduledLoginWarmings.size >=
      this.maxScheduledLoginWarmings
    ) {
      const oldestKey = this.scheduledLoginWarmings.keys().next().value as
        | string
        | undefined;
      if (!oldestKey) {
        break;
      }
      this.scheduledLoginWarmings.delete(oldestKey);
    }
  }

  /** Obtiene estadisticas operativas de la cola. */
  async getQueueStats() {
    const waiting = await this.cacheWarmingQueue.getWaiting();
    const active = await this.cacheWarmingQueue.getActive();
    const completed = await this.cacheWarmingQueue.getCompleted();
    const failed = await this.cacheWarmingQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length,
    };
  }

  /**
   * Limpiar cola (para mantenimiento)
   */
  async clearQueue(): Promise<void> {
    await this.cacheWarmingQueue.obliterate({ force: true });
    this.logger.warn('🧹 Cola de cache warming limpiada');
  }
}
