import { Module } from '@nestjs/common';
import { NotificacionsService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { NotificacionsRepository } from './repository';
import { UsuariosModule } from '../usuarios/module';
import { TokenPushsModule } from '../tokenPush/module';
import { PushNotificationsModule } from '../../auxiliares/push-notifications/module';

@Module({
  imports: [AxiosModule, UsuariosModule, TokenPushsModule, PushNotificationsModule],
  controllers: [],
  providers: [NotificacionsService, NotificacionsRepository],
  exports: [NotificacionsService],
})
export class NotificacionsModule {}
