import { Module } from '@nestjs/common';
import { WebsocketModule } from '../websocket/websocket.module';
import { MqttSubscriberService } from './mqttSubscriber.service';

@Module({
  imports: [WebsocketModule],
  providers: [MqttSubscriberService],
  exports: [MqttSubscriberService],
})
export class MqttSubscriberModule {}
