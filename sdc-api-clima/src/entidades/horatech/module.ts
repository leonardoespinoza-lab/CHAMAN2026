import { Module } from '@nestjs/common';
import { HoratechService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { HoratechRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [HoratechService, HoratechRepository],
  exports: [HoratechService],
})
export class HoratechModule {}
