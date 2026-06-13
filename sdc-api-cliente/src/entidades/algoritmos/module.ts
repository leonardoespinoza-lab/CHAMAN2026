import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { AlgoritmosController } from './controller';
import { AlgoritmosRepository } from './repository';
import { AlgoritmosService } from './service';

@Module({
  imports: [AxiosModule],
  controllers: [AlgoritmosController],
  providers: [AlgoritmosService, AlgoritmosRepository],
  exports: [AlgoritmosService],
})
export class AlgoritmosModule {}
