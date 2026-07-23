import { Module } from '@nestjs/common';
import { EstacionsService } from './service';
import { EstacionsController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { EstacionsRepository } from './repository';
import { EstablecimientosRepository } from '../establecimiento/repository';

@Module({
  imports: [AxiosModule],
  controllers: [EstacionsController],
  providers: [
    EstacionsService,
    EstacionsRepository,
    EstablecimientosRepository,
  ],
  exports: [EstacionsService],
})
export class EstacionsModule {}
