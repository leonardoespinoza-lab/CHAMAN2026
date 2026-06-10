import { Module } from '@nestjs/common';
import { LotesService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { LotesRepository } from './repository';
import { EstacionsModule } from '../estacion/module';

@Module({
  imports: [AxiosModule, EstacionsModule],
  providers: [LotesService, LotesRepository],
  exports: [LotesService],
})
export class LotesModule {}
