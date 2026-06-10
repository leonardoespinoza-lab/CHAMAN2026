import { Module } from '@nestjs/common';
import { MqttPublisherService } from './mqttPublisher.service';

@Module({
  imports: [],
  providers: [MqttPublisherService],
  exports: [MqttPublisherService],
})
export class MqttPublisherModule {}
