import { Module } from '@nestjs/common';
import { FertilizacionsService } from './service';
import { FertilizacionsController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { FertilizacionsRepository } from './repository';
import { AlertasModule } from '../alerta/module';
import { LotesModule } from '../lote/module';

@Module({
  imports: [AxiosModule, AlertasModule, LotesModule],
  controllers: [FertilizacionsController],
  providers: [FertilizacionsService, FertilizacionsRepository],
  exports: [FertilizacionsService],
})
export class FertilizacionsModule {}
