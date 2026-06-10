import { forwardRef, Module } from '@nestjs/common';
import { SiembrasService } from './service';
import { SiembrasController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { SiembrasRepository } from './repository';
import { PrediccionsModule } from '../prediccion/module';
import { SemillasModule } from '../semilla/module';
import { CronosModule } from '../crono/module';
import { LotesModule } from '../lote/module';
import { FertilizacionsModule } from '../fertilizacion/module';
import { FumigacionsModule } from '../fumigacion/module';
import { ClimaModule } from '../clima/module';

@Module({
  imports: [
    AxiosModule,
    PrediccionsModule,
    SemillasModule,
    CronosModule,
    LotesModule,
    forwardRef(() => FertilizacionsModule),
    FumigacionsModule,
    ClimaModule,
  ],
  controllers: [SiembrasController],
  providers: [SiembrasService, SiembrasRepository],
  exports: [SiembrasService],
})
export class SiembrasModule {}
