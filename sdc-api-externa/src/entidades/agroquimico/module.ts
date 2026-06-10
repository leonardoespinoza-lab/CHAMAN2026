import { Module } from '@nestjs/common';
import { AgroquimicosService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { AgroquimicosRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [AgroquimicosService, AgroquimicosRepository],
  exports: [AgroquimicosService],
})
export class AgroquimicosModule {}
