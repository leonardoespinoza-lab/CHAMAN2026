import { Module } from '@nestjs/common';
import { ProductorsService } from './service';
import { ProductorsController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ProductorsRepository } from './repository';
import { DistribuidorsModule } from '../distribuidor/module';
import { LicenciasModule } from '../licencia/module';
import { LicenciaPorEntidadsModule } from '../licenciaPorEntidad/module';
import { AdvisorScopeModule } from '../../auxiliares/authorization/advisor-scope.module';
import { EstablecimientosRepository } from '../establecimiento/repository';
import { LotesRepository } from '../lote/repository';
import { TenantsRepository } from '../tenant/repository';

@Module({
  imports: [
    AxiosModule,
    DistribuidorsModule,
    LicenciasModule,
    LicenciaPorEntidadsModule,
    AdvisorScopeModule,
  ],
  controllers: [ProductorsController],
  providers: [
    ProductorsService,
    ProductorsRepository,
    EstablecimientosRepository,
    LotesRepository,
    TenantsRepository,
  ],
  exports: [ProductorsService],
})
export class ProductorsModule {}
