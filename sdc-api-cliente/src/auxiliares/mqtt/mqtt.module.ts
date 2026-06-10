import { Module } from '@nestjs/common';
import { MqttInterceptor } from './mqtt.interceptor';
import { MqttService } from './mqtt.service';

@Module({
  providers: [MqttService, MqttInterceptor],
  exports: [MqttService, MqttInterceptor],
})
export class MqttModule {}
