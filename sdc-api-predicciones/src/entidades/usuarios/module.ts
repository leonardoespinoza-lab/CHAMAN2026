import { Module } from '@nestjs/common';
import { UsuariosService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { UsuariosRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [UsuariosService, UsuariosRepository],
  exports: [UsuariosService],
})
export class UsuariosModule {}
