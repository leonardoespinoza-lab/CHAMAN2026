import { Module } from '@nestjs/common';
import { UsuariosService } from './service';
import { UsuariosController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { UsuariosRepository } from './repository';
import { ProductorsModule } from '../productor/module';
import { AuthenticationModule } from '../../auxiliares/authentication/authentication.module';

@Module({
  imports: [AxiosModule, ProductorsModule, AuthenticationModule],
  controllers: [UsuariosController],
  providers: [UsuariosService, UsuariosRepository],
  exports: [UsuariosService],
})
export class UsuariosModule {}
