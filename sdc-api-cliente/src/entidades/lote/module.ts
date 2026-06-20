import { Module } from '@nestjs/common';
import { LotesService } from './service';
import { LotesController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { LotesRepository } from './repository';
import { EstablecimientosModule } from '../establecimiento/module';
import { ReporteNDVIsModule } from '../reporte-ndvis/module';
import { NdviQueueService } from './ndvi-queue.service';
import { SatelliteSyncService } from './satellite-sync.service';
import { ClimaModule } from '../clima/module';

@Module({
  imports: [AxiosModule, EstablecimientosModule, ReporteNDVIsModule, ClimaModule],
  controllers: [LotesController],
  providers: [LotesService, LotesRepository, NdviQueueService, SatelliteSyncService],
  exports: [LotesService],
})
export class LotesModule {}
