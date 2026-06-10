import { Module } from '@nestjs/common';
import { HealthModule } from './auxiliares/health/health.module';
import { MqttSubscriberModule } from './mqtt/mqttSubscriber.module';
import { WebsocketModule } from './websocket/websocket.module';

@Module({
  imports: [HealthModule, WebsocketModule, MqttSubscriberModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
