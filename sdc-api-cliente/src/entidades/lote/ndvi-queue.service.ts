import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ILote } from 'modelos/src';
import Redis from 'ioredis';
import {
  ENV,
  REDIS_COMMAND_TIMEOUT,
  REDIS_CONNECT_TIMEOUT,
  REDIS_HOST,
  REDIS_NDVI_DB,
  REDIS_NDVI_QUEUE,
  REDIS_PASSWORD,
  REDIS_PORT,
} from '../../env';

export interface NdviQueueStatus {
  enabled: boolean;
  env: string;
  queue: string;
  db: number;
  connected: boolean;
  redisStatus?: string;
  queueLength?: number;
  reason?: string;
  error?: string;
}

@Injectable()
export class NdviQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NdviQueueService.name);
  private readonly taskDedupTtlSeconds = 12 * 60 * 60;
  private redis?: Redis;
  private enabled = false;

  onModuleInit() {
    if (ENV === 'local') {
      this.logger.warn('Cola NDVI Redis desactivada en entorno local');
      return;
    }
    this.redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD || undefined,
      db: REDIS_NDVI_DB,
      connectTimeout: REDIS_CONNECT_TIMEOUT,
      commandTimeout: REDIS_COMMAND_TIMEOUT,
      lazyConnect: true,
    });
    this.enabled = true;
    this.redis.on('error', (err) =>
      this.logger.error(`Redis error: ${err.message}`),
    );
  }

  onModuleDestroy() {
    this.redis?.disconnect();
  }

  async enqueueLote(
    lote: ILote,
    sceneDatetime?: string | null,
    sceneCollection?: string | null,
    forceRender = false,
  ): Promise<boolean> {
    if (!this.enabled || !this.redis) {
      return false;
    }
    const polygon = lote.ubicacion?.geojson?.coordinates;
    if (!polygon?.length) {
      this.logger.warn(
        `Lote ${lote._id} sin poligono GeoJSON, se omite tarea NDVI`,
      );
      return false;
    }
    const task = {
      lote_id: lote._id,
      scene_datetime: sceneDatetime || null,
      scene_collection: sceneCollection || null,
      force_render: forceRender,
      polygon,
    };
    const dedupeKey = this.taskDedupeKey(lote, sceneDatetime, forceRender);
    const reserved = await this.redis.set(
      dedupeKey,
      '1',
      'EX',
      this.taskDedupTtlSeconds,
      'NX',
    );
    if (reserved !== 'OK') {
      this.logger.warn(`Tarea NDVI duplicada omitida para lote ${lote._id}`);
      return false;
    }
    await this.redis.lpush(REDIS_NDVI_QUEUE, JSON.stringify(task));
    this.logger.log(`Tarea NDVI encolada para lote ${lote._id}`);
    return true;
  }

  private taskDedupeKey(
    lote: ILote,
    sceneDatetime?: string | null,
    forceRender = false,
  ): string {
    const parsedDate = sceneDatetime ? new Date(sceneDatetime) : undefined;
    const sceneKey =
      parsedDate && Number.isFinite(parsedDate.getTime())
        ? parsedDate.toISOString().slice(0, 10)
        : 'latest';
    return [
      'ndvi-task',
      lote._id || 'sin-lote',
      sceneKey,
      forceRender ? 'force-v3' : 'normal',
    ].join(':');
  }

  async getStatus(): Promise<NdviQueueStatus> {
    const base: NdviQueueStatus = {
      enabled: this.enabled,
      env: ENV,
      queue: REDIS_NDVI_QUEUE,
      db: REDIS_NDVI_DB,
      connected: false,
      redisStatus: this.redis?.status,
    };

    if (!this.enabled || !this.redis) {
      return {
        ...base,
        reason: ENV === 'local' ? 'disabled-local-env' : 'redis-not-initialized',
      };
    }

    try {
      const pong = await this.redis.ping();
      const queueLength = await this.redis.llen(REDIS_NDVI_QUEUE);
      return {
        ...base,
        connected: pong === 'PONG',
        redisStatus: this.redis.status,
        queueLength,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ...base,
        connected: false,
        redisStatus: this.redis.status,
        error: message.slice(0, 180),
      };
    }
  }
}
