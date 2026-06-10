import { Module } from '@nestjs/common';
import { SiembrasService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { SiembrasRepository } from './repository';
import { PrediccionsModule } from '../prediccion/module';
import { SemillasModule } from '../semilla/module';
import { CronosModule } from '../crono/module';
import { LotesModule } from '../lote/module';

@Module({
  imports: [
    AxiosModule,
    PrediccionsModule,
    SemillasModule,
    CronosModule,
    LotesModule,
  ],
  providers: [SiembrasService, SiembrasRepository],
  exports: [SiembrasService],
})
export class SiembrasModule {}
