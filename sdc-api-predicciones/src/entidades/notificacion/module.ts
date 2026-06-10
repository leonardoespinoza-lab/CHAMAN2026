import { Module } from '@nestjs/common';
import { NotificacionsService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { NotificacionsRepository } from './repository';
import { UsuariosModule } from '../usuarios/module';
import { TokenPushsModule } from '../tokenPush/module';
import { FirebaseAdminModule } from '../../auxiliares/firebase-admin/module';

@Module({
  imports: [AxiosModule, UsuariosModule, TokenPushsModule, FirebaseAdminModule],
  controllers: [],
  providers: [NotificacionsService, NotificacionsRepository],
  exports: [NotificacionsService],
})
export class NotificacionsModule {}
