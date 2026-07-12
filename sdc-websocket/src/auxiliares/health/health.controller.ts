import { Controller, Get } from '@nestjs/common';
import { MqttSubscriberService } from '../../mqtt/mqttSubscriber.service';

@Controller('health')
export class HealthController {
  constructor(private readonly realtime: MqttSubscriberService) {}

  @Get()
  check() {
    return { ok: true, service: 'sdc-websocket' };
  }

  @Get('/check')
  check2() {
    const realtime = this.realtime.getStatus();
    return { ok: realtime.connected, service: 'sdc-websocket', realtime };
  }
}
