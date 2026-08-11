import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ClimaController } from './controller';
import { ClimaService } from './service';
import { FieldClimateModule } from '../fieldClimate/module';
import { EstacionsModule } from '../estacion/module';
import { MeteoSourceModule } from '../meteoSource/module';
import { OmixomModule } from '../omixom/module';
import { OpenMeteoModule } from '../../auxiliares/open-meteo/open-meteo.module';

@Module({
  imports: [
    AxiosModule,
    FieldClimateModule,
    EstacionsModule,
    MeteoSourceModule,
    OmixomModule,
    OpenMeteoModule,
  ],
  controllers: [ClimaController],
  providers: [ClimaService],
  exports: [ClimaService],
})
export class ClimaModule {}
