import { Module } from '@nestjs/common';
import { EmpresasService } from './service';
import { EmpresasController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { EmpresasRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [EmpresasController],
  providers: [EmpresasService, EmpresasRepository],
  exports: [EmpresasService],
})
export class EmpresasModule {}
