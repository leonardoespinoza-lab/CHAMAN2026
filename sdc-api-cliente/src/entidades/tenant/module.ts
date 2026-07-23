import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { UsuariosModule } from '../usuario/module';
import { TenantsController } from './controller';
import { TenantsRepository } from './repository';
import { TenantsService } from './service';

@Module({
  imports: [AxiosModule, UsuariosModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantsRepository],
  exports: [TenantsService],
})
export class TenantsModule {}
