import { Module } from '@nestjs/common';
import { QuimicasService } from './service';
import { QuimicasController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { QuimicasRepository } from './repository';
import { LicenciaPorEntidadsModule } from '../licenciaPorEntidad/module';
import { LicenciasModule } from '../licencia/module';
import { DistribuidorsRepository } from '../distribuidor/repository';
import { ProductorsRepository } from '../productor/repository';
import { EstablecimientosRepository } from '../establecimiento/repository';
import { LotesRepository } from '../lote/repository';

@Module({
  imports: [AxiosModule, LicenciaPorEntidadsModule, LicenciasModule],
  controllers: [QuimicasController],
  providers: [
    QuimicasService,
    QuimicasRepository,
    DistribuidorsRepository,
    ProductorsRepository,
    EstablecimientosRepository,
    LotesRepository,
  ],
  exports: [QuimicasService],
})
export class QuimicasModule {}
