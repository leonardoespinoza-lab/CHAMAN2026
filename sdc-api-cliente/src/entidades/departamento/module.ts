import { Module } from '@nestjs/common';
import { DepartamentosService } from './service';
import { DepartamentosController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { DepartamentosRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [DepartamentosController],
  providers: [DepartamentosService, DepartamentosRepository],
  exports: [DepartamentosService],
})
export class DepartamentosModule {}
