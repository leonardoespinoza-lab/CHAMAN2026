import { Module } from '@nestjs/common';
import { LorawanUplinksModule } from '../../entidades/lorawan-uplinks/module';
import { ReportesModule } from '../../entidades/reportes/module';
import { LorawanMqttConsumerService } from './service';

@Module({
  imports: [LorawanUplinksModule, ReportesModule],
  providers: [LorawanMqttConsumerService],
})
export class LorawanMqttConsumerModule {}
