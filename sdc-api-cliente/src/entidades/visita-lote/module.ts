import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { LotesModule } from '../lote/module';
import { VisitasLoteController } from './controller';
import { VisitasLoteRepository } from './repository';
import { VisitasLoteService } from './service';

@Module({
  imports: [AxiosModule, LotesModule],
  controllers: [VisitasLoteController],
  providers: [VisitasLoteService, VisitasLoteRepository],
  exports: [VisitasLoteService],
})
export class VisitasLoteModule {}
