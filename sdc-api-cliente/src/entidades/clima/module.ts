import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ClimaService } from './service';
import { ClimaController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ClimaRepository } from './repository';
import { EstablecimientosModule } from '../establecimiento/module';
import { TileCacheModule } from '../../auxiliares/tile-cache/tile-cache.module';
import { TileCalculationModule } from '../../auxiliares/tile-calculation/tile-calculation.module';

@Module({
  imports: [
    AxiosModule,
    HttpModule,
    TileCacheModule,
    TileCalculationModule,
    forwardRef(() => EstablecimientosModule),
  ],
  controllers: [ClimaController],
  providers: [ClimaService, ClimaRepository],
  exports: [ClimaService, ClimaRepository],
})
export class ClimaModule {}
