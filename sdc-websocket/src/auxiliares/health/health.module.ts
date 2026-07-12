import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MqttSubscriberModule } from '../../mqtt/mqttSubscriber.module';

@Module({
  imports: [MqttSubscriberModule],
  controllers: [HealthController],
})
export class HealthModule {}
