import { Module } from '@nestjs/common';
import { DistribuidorsService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { DistribuidorsRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [DistribuidorsService, DistribuidorsRepository],
  exports: [DistribuidorsService],
})
export class DistribuidorsModule {}
