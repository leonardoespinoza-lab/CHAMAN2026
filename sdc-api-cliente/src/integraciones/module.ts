import { Module } from '@nestjs/common';
import { IntegrationControlStore } from './control-store';
import { IntegrationAdminController } from './admin.controller';
import { IntegrationAdminService } from './admin.service';
import { AxiosModule } from '../auxiliares/axios/axios.module';
import { AdvisorScopeModule } from '../auxiliares/authorization/advisor-scope.module';
import { ProductorsModule } from '../entidades/productor/module';
import { EstablecimientosModule } from '../entidades/establecimiento/module';
import { LotesModule } from '../entidades/lote/module';
import { SiembrasModule } from '../entidades/siembra/module';
import { SemillasModule } from '../entidades/semilla/module';
import { LicenciaPorEntidadsModule } from '../entidades/licenciaPorEntidad/module';
import { UsuariosRepository } from '../entidades/usuario/repository';
import { ProductorsRepository } from '../entidades/productor/repository';
import { EstablecimientosRepository } from '../entidades/establecimiento/repository';
import { LotesRepository } from '../entidades/lote/repository';
import { SiembrasRepository } from '../entidades/siembra/repository';
import { IntegrationRegistry } from './registry';
import { IntegrationRuntime } from './runtime';
import { IntegrationGuard } from './guard';
import { IntegrationsService } from './service';
import { IntegrationsController } from './controller';
import { DecisionPipelineModule } from '../auxiliares/decision-pipeline/decision-pipeline.module';

@Module({
  imports: [
    AxiosModule,
    AdvisorScopeModule,
    ProductorsModule,
    EstablecimientosModule,
    LotesModule,
    SiembrasModule,
    SemillasModule,
    LicenciaPorEntidadsModule,
    DecisionPipelineModule,
  ],
  controllers: [IntegrationsController, IntegrationAdminController],
  providers: [
    IntegrationControlStore,
    IntegrationAdminService,
    IntegrationRegistry,
    IntegrationRuntime,
    IntegrationGuard,
    IntegrationsService,
    UsuariosRepository,
    ProductorsRepository,
    EstablecimientosRepository,
    LotesRepository,
    SiembrasRepository,
  ],
})
export class IntegrationsModule {}
