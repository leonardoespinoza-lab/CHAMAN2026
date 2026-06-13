import { Module } from '@nestjs/common';
import { LorawanUplinksModule } from '../../entidades/lorawan-uplinks/module';
import { LorawanMqttConsumerService } from './service';

@Module({
  imports: [LorawanUplinksModule],
  providers: [LorawanMqttConsumerService],
})
export class LorawanMqttConsumerModule {}
