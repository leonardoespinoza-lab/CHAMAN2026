import { Module } from '@nestjs/common';
import { PushNotificationsService } from './service';

@Module({
  providers: [PushNotificationsService],
  exports: [PushNotificationsService],
})
export class PushNotificationsModule {}
