import { Module } from '@nestjs/common';
import { EmpresasService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { EmpresasRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [EmpresasService, EmpresasRepository],
  exports: [EmpresasService],
})
export class EmpresasModule {}
