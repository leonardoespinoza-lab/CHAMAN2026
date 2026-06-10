import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ClimaController } from './controller';
import { ClimaService } from './service';
import { FieldClimateModule } from '../fieldClimate/module';
import { EstacionsModule } from '../estacion/module';
import { MeteoSourceModule } from '../meteoSource/module';
import { OmixomModule } from '../omixom/module';

@Module({
  imports: [
    AxiosModule,
    FieldClimateModule,
    EstacionsModule,
    MeteoSourceModule,
    OmixomModule,
  ],
  controllers: [ClimaController],
  providers: [ClimaService],
  exports: [ClimaService],
})
export class ClimaModule {}
