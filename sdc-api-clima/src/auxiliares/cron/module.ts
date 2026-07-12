import { Module } from '@nestjs/common';
import { CronService } from './service';
import { EstacionsModule } from '../../entidades/estacion/module';
import { FieldClimateModule } from '../../entidades/fieldClimate/module';
import { CronController } from './controller';
import { OmixomModule } from 'src/entidades/omixom/module';
import { LotesModule } from 'src/entidades/lote/module';
import { ClimaModule } from 'src/entidades/clima/module';

@Module({
  imports: [
    EstacionsModule,
    FieldClimateModule,
    OmixomModule,
    LotesModule,
    ClimaModule,
  ],
  controllers: [CronController],
  providers: [CronService],
  exports: [CronService],
})
export class CronModule {}
