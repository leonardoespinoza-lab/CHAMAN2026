import { Module } from '@nestjs/common';
import { LicenciaPorEntidadsService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { LicenciaPorEntidadsRepository } from './repository';
import { LicenciasModule } from '../licencia/module';
import { LicenciaPorEntidadsController } from './controller';
import { LicenseUsageService } from './usage.service';
import { UsuariosRepository } from '../usuario/repository';
import { DistribuidorsRepository } from '../distribuidor/repository';
import { ProductorsRepository } from '../productor/repository';
import { EstablecimientosRepository } from '../establecimiento/repository';
import { LotesRepository } from '../lote/repository';

@Module({
  imports: [AxiosModule, LicenciasModule],
  controllers: [LicenciaPorEntidadsController],
  providers: [
    LicenciaPorEntidadsService,
    LicenciaPorEntidadsRepository,
    LicenseUsageService,
    UsuariosRepository,
    DistribuidorsRepository,
    ProductorsRepository,
    EstablecimientosRepository,
    LotesRepository,
  ],
  exports: [LicenciaPorEntidadsService],
})
export class LicenciaPorEntidadsModule {}
