import { Module } from '@nestjs/common';
import { DispositivosService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { DispositivosRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [DispositivosService, DispositivosRepository],
  exports: [DispositivosService],
})
export class DispositivosModule {}
