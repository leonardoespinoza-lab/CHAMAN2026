import { Module } from '@nestjs/common';
import { TileCalculationService } from './tile-calculation.service';

@Module({
  providers: [TileCalculationService],
  exports: [TileCalculationService],
})
export class TileCalculationModule {}
