import { Module } from '@nestjs/common';
import { UsuariosService } from './service';
import { UsuariosController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { UsuariosRepository } from './repository';
import { ProductorsModule } from '../productor/module';
import { AuthenticationModule } from '../../auxiliares/authentication/authentication.module';
import { EstablecimientosRepository } from '../establecimiento/repository';
import { LotesRepository } from '../lote/repository';
import { DistribuidorsRepository } from '../distribuidor/repository';
import { ProductorsRepository } from '../productor/repository';
import { TenantsRepository } from '../tenant/repository';

@Module({
  imports: [AxiosModule, ProductorsModule, AuthenticationModule],
  controllers: [UsuariosController],
  providers: [
    UsuariosService,
    UsuariosRepository,
    EstablecimientosRepository,
    LotesRepository,
    DistribuidorsRepository,
    ProductorsRepository,
    TenantsRepository,
  ],
  exports: [UsuariosService],
})
export class UsuariosModule {}
