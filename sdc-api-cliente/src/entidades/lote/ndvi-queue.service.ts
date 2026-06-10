import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ILote } from 'modelos/src';
import Redis from 'ioredis';
import { ENV, REDIS_DB, REDIS_HOST, REDIS_PASSWORD, REDIS_PORT } from '../../env';

const NDVI_QUEUE = 'tareas-ndvi';

@Injectable()
export class NdviQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NdviQueueService.name);
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
      db: REDIS_DB,
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

  async enqueueLote(lote: ILote): Promise<void> {
    if (!this.enabled || !this.redis) {
      return;
    }
    const polygon = lote.ubicacion?.geojson?.coordinates;
    if (!polygon?.length) {
      this.logger.warn(`Lote ${lote._id} sin polígono GeoJSON, se omite tarea NDVI`);
      return;
    }
    const task = {
      lote_id: lote._id,
      scene_datetime: null,
      polygon,
    };
    await this.redis.lpush(NDVI_QUEUE, JSON.stringify(task));
    this.logger.log(`✅ Tarea NDVI encolada para lote ${lote._id}`);
  }
}
