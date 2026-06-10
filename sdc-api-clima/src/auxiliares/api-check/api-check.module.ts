import { Module } from '@nestjs/common';
import { AxiosModule } from '../axios/axios.module';
import { ApiCheckService } from './api-check.service';
import { FieldClimateModule } from 'src/entidades/fieldClimate/module';
import { OpenWeatherModule } from 'src/entidades/openWeather/module';
import { MeteoSourceModule } from 'src/entidades/meteoSource/module';
import { OmixomModule } from 'src/entidades/omixom/module';
import { HoratechModule } from 'src/entidades/horatech/module';

@Module({
  imports: [
    AxiosModule,
    FieldClimateModule,
    OpenWeatherModule,
    MeteoSourceModule,
    OmixomModule,
    HoratechModule,
  ],
  providers: [ApiCheckService],
  exports: [ApiCheckService],
})
export class ApiCheckModule {}
