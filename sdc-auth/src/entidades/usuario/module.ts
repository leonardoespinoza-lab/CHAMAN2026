import { Module } from '@nestjs/common';
import { UsuariosService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { UsuariosRepository } from './repository';
import { ProductorsModule } from '../productor/module';

@Module({
  imports: [AxiosModule, ProductorsModule],
  providers: [UsuariosService, UsuariosRepository],
  exports: [UsuariosService],
})
export class UsuariosModule {}
