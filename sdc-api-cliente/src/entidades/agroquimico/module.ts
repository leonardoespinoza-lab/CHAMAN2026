import { Module } from '@nestjs/common';
import { AgroquimicosService } from './service';
import { AgroquimicosController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { AgroquimicosRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [AgroquimicosController],
  providers: [AgroquimicosService, AgroquimicosRepository],
  exports: [AgroquimicosService],
})
export class AgroquimicosModule {}
