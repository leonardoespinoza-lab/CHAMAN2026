import { Module } from '@nestjs/common';
import { LotesService } from './service';
import { LotesController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { LotesRepository } from './repository';
import { EstablecimientosModule } from '../establecimiento/module';
import { ReporteNDVIsModule } from '../reporte-ndvis/module';
import { NdviQueueService } from './ndvi-queue.service';

@Module({
  imports: [AxiosModule, EstablecimientosModule, ReporteNDVIsModule],
  controllers: [LotesController],
  providers: [LotesService, LotesRepository, NdviQueueService],
  exports: [LotesService],
})
export class LotesModule {}
