import { Module } from '@nestjs/common';
import { TileCacheService } from './tile-cache.service';

@Module({
  providers: [TileCacheService],
  exports: [TileCacheService],
})
export class TileCacheModule {}
