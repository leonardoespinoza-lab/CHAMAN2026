import { Module } from '@nestjs/common';
import { HealthModule } from './auxiliares/health/health.module';
import { FieldClimateModule } from './entidades/fieldClimate/module';
import { ClimaModule } from './entidades/clima/module';
import { CronModule } from './auxiliares/cron/module';
import { ScheduleModule } from '@nestjs/schedule';
import { OpenWeatherModule } from './entidades/openWeather/module';
import { MeteoSourceModule } from './entidades/meteoSource/module';
import { ApiCheckModule } from './auxiliares/api-check/api-check.module';
import { ApiCheckService } from './auxiliares/api-check/api-check.service';
import { HoratechModule } from './entidades/horatech/module';
import { ClimaV2Module } from './entidades/clima-v2/module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ApiCheckModule,
    HealthModule,
    CronModule,
    ClimaModule,
    ClimaV2Module,
    FieldClimateModule,
    OpenWeatherModule,
    MeteoSourceModule,
    HoratechModule,
  ],
})
export class AppModule {
  constructor(private apiCheck: ApiCheckService) {
    this.onInit();
  }
  private async onInit() {
    await this.apiCheck.checkApis();
  }
}
