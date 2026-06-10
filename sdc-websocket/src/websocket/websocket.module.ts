import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../auxiliares/authentication/authentication.module';
import { MqttPublisherModule } from '../mqtt/mqttPublisher.module';
import { EventsGateway } from './events.gateway';
import { WebsocketService } from './websocket.service';

@Module({
  imports: [AuthenticationModule, MqttPublisherModule],
  providers: [EventsGateway, WebsocketService],
  exports: [WebsocketService],
})
export class WebsocketModule {}
