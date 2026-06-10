import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { SiembrasModule } from '../siembra/module';
import { CronosModule } from '../crono/module';
import { ClimaModule } from '../clima/module';
import { NotificacionsModule } from '../notificacion/module';
import { AlertasModule } from '../alerta/module';
import { RiegoService } from './service';
import { RiegoController } from './controller';
import { LotesModule } from '../lote/module';
import { PrediccionRiegoModule } from '../prediccion-riego/module';
import { EstacionsModule } from '../estacion/module';
import { HttpsModule } from '../https/https.module';
import { DispositivosModule } from '../dispositivos/module';
import { ClimaV2Module } from '../clima-v2/module';

@Module({
  imports: [
    AxiosModule,
    SiembrasModule,
    CronosModule,
    ClimaModule,
    NotificacionsModule,
    AlertasModule,
    LotesModule,
    PrediccionRiegoModule,
    EstacionsModule,
    HttpsModule,
    DispositivosModule,
    ClimaV2Module,
  ],
  controllers: [RiegoController],
  providers: [RiegoService],
  exports: [RiegoService],
})
export class RiegoModule {}
