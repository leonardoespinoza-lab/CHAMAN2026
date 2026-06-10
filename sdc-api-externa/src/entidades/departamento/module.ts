import { Module } from '@nestjs/common';
import { DepartamentosService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { DepartamentosRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [DepartamentosService, DepartamentosRepository],
  exports: [DepartamentosService],
})
export class DepartamentosModule {}
