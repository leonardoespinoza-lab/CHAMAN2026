import { Module } from '@nestjs/common';
import { AxiosModule } from '../axios/axios.module';
import { EstablecimientosRepository } from '../../entidades/establecimiento/repository';
import { ProductorsRepository } from '../../entidades/productor/repository';
import { AdvisorScopeService } from './advisor-scope.service';

@Module({
  imports: [AxiosModule],
  providers: [
    AdvisorScopeService,
    EstablecimientosRepository,
    ProductorsRepository,
  ],
  exports: [AdvisorScopeService],
})
export class AdvisorScopeModule {}
