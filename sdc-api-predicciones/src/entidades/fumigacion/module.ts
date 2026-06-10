import { Module } from '@nestjs/common';
import { FumigacionsService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { FumigacionsRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [FumigacionsService, FumigacionsRepository],
  exports: [FumigacionsService],
})
export class FumigacionsModule {}
