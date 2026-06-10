import { Module } from '@nestjs/common';
import { DispositivosService } from './service';
import { DispositivosController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { DispositivosRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [DispositivosController],
  providers: [DispositivosService, DispositivosRepository],
  exports: [DispositivosService],
})
export class DispositivosModule {}
