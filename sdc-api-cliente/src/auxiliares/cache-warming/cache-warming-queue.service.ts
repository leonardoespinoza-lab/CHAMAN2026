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

      const jobData: ICacheWarmingJob = {
        userId,
        permisos,
        variables: criticalVariables,
        zoomLevels: commonZoomLevels, // Array de zoom levels
        loginTime: new Date().toISOString(),
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

      const jobId = `cache-warm-login-${userId}-${Date.now()}`;

      this.logger.log(`📋 Intentando agregar job a cola: ${jobId}`);

      const job = await this.cacheWarmingQueue.add('warm-user-login', jobData, {
        ...jobOptions,
        jobId,
      });

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

  /**
   * Obtener estadísticas de la cola
   */
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
