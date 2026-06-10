import { Module } from '@nestjs/common';
import { EstablecimientosService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { EstablecimientosRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [EstablecimientosService, EstablecimientosRepository],
  exports: [EstablecimientosService],
})
export class EstablecimientosModule {}
