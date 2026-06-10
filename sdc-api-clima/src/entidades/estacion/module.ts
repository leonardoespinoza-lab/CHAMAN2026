import { Module } from '@nestjs/common';
import { EstacionsService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { EstacionsRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [EstacionsService, EstacionsRepository],
  exports: [EstacionsService],
})
export class EstacionsModule {}
