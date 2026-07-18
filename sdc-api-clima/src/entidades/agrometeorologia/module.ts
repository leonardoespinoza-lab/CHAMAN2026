import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ClimaModule } from '../clima/module';
import { AgrometeorologiaController } from './controller';
import { AgrometeorologiaRepository } from './repository';
import { WeatherSourceResolverService } from './weather-source-resolver.service';
import { WeatherIngestionService } from './weather-ingestion.service';
import { AgrometeorologicalEngineService } from './agrometeorological-engine.service';
import { AgrometeorologiaBatchService } from './batch.service';
import { AgrometeorologiaCronService } from './cron.service';
import { AgrometeorologiaInternalServiceGuard } from './internal-service.guard';
import { SensorWeatherOverlayService } from './sensor-weather-overlay.service';

@Module({
  imports: [AxiosModule, ClimaModule],
  controllers: [AgrometeorologiaController],
  providers: [
    AgrometeorologiaRepository,
    WeatherSourceResolverService,
    WeatherIngestionService,
    AgrometeorologicalEngineService,
    AgrometeorologiaBatchService,
    AgrometeorologiaCronService,
    AgrometeorologiaInternalServiceGuard,
    SensorWeatherOverlayService,
  ],
  exports: [AgrometeorologicalEngineService, AgrometeorologiaBatchService],
})
export class AgrometeorologiaModule {}
