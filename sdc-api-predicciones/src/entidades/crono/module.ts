import { Module } from '@nestjs/common';
import { CronosService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { CronosRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [],
  providers: [CronosService, CronosRepository],
  exports: [CronosService],
})
export class CronosModule {}
