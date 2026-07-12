import { Module } from '@nestjs/common';
import { AxiosModule } from '../axios/axios.module';
import { ApiCheckService } from './api-check.service';
import { FieldClimateModule } from 'src/entidades/fieldClimate/module';
import { OpenWeatherModule } from 'src/entidades/openWeather/module';
import { MeteoSourceModule } from 'src/entidades/meteoSource/module';
import { MeteoblueModule } from 'src/entidades/meteoblue/module';
import { OmixomModule } from 'src/entidades/omixom/module';

@Module({
  imports: [
    AxiosModule,
    FieldClimateModule,
    OpenWeatherModule,
    MeteoSourceModule,
    MeteoblueModule,
    OmixomModule,
  ],
  providers: [ApiCheckService],
  exports: [ApiCheckService],
})
export class ApiCheckModule {}
