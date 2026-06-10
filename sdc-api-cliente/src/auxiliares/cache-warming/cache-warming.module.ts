import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
import { CacheWarmingQueueService } from './cache-warming-queue.service';
import { CacheWarmingProcessor } from './cache-warming.processor';
import { LoginCacheWarmingInterceptor } from './login-cache-warming.interceptor';
import { EstablecimientosModule } from '../../entidades/establecimiento/module';
import { TileCalculationModule } from '../tile-calculation/tile-calculation.module';
import { TileCacheModule } from '../tile-cache/tile-cache.module';

@Module({
  imports: [
    // Configurar la cola de BullMQ para cache warming
    BullModule.registerQueue({
      name: 'cache-warming',
    }),

    // HTTP module para hacer requests a APIs
    HttpModule.register({
      timeout: 10000, // 10 segundos timeout por defecto
      maxRedirects: 3,
    }),

    // Módulo de establecimientos para usar el service
    EstablecimientosModule,

    // Módulo de cálculo de tiles compartido
    TileCalculationModule,

    // Módulo de cache de tiles
    TileCacheModule,
  ],
  providers: [
    CacheWarmingQueueService,
    CacheWarmingProcessor,
    LoginCacheWarmingInterceptor,
  ],
  exports: [CacheWarmingQueueService, LoginCacheWarmingInterceptor],
})
export class CacheWarmingModule {}
