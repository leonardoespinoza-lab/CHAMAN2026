import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ClimaV2Controller } from './controller';
import { ClimaV2Service } from './service';
import { FieldClimateModule } from '../fieldClimate/module';
import { EstacionsModule } from '../estacion/module';
import { MeteoSourceModule } from '../meteoSource/module';
import { OmixomModule } from '../omixom/module';
import { HoratechModule } from '../horatech/module';
import { ReportesModule } from '../reportes/module';
import { DispositivosModule } from '../dispositivos/module';

@Module({
  imports: [
    AxiosModule,
    FieldClimateModule,
    EstacionsModule,
    MeteoSourceModule,
    OmixomModule,
    HoratechModule,
    ReportesModule,
    DispositivosModule,
  ],
  controllers: [ClimaV2Controller],
  providers: [ClimaV2Service],
  exports: [ClimaV2Service],
})
export class ClimaV2Module {}
