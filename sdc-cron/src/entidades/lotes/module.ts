import { Module } from '@nestjs/common';
import { LotesService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { LotesRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [LotesService, LotesRepository],
  exports: [LotesService],
})
export class LotesModule {}
