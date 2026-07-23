import { Module } from '@nestjs/common';
import { DistribuidorsService } from './service';
import { DistribuidorsController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { DistribuidorsRepository } from './repository';
import { LicenciaPorEntidadsModule } from '../licenciaPorEntidad/module';
import { LicenciasModule } from '../licencia/module';
import { ProductorsRepository } from '../productor/repository';
import { EstablecimientosRepository } from '../establecimiento/repository';
import { LotesRepository } from '../lote/repository';

@Module({
  imports: [AxiosModule, LicenciaPorEntidadsModule, LicenciasModule],
  controllers: [DistribuidorsController],
  providers: [
    DistribuidorsService,
    DistribuidorsRepository,
    ProductorsRepository,
    EstablecimientosRepository,
    LotesRepository,
  ],
  exports: [DistribuidorsService],
})
export class DistribuidorsModule {}
