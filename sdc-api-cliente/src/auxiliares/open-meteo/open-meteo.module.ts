import { Module } from '@nestjs/common';
import { OpenMeteoClientService } from './open-meteo-client.service';

@Module({
  providers: [OpenMeteoClientService],
  exports: [OpenMeteoClientService],
})
export class OpenMeteoModule {}
