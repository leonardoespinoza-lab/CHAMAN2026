import { Module } from '@nestjs/common';
import { OpenMeteoModule } from '../../auxiliares/open-meteo/open-meteo.module';
import { AlertasModule } from '../alerta/module';
import { NotificacionsModule } from '../notificacion/module';
import { SiembrasModule } from '../siembra/module';
import { AgroclimaService } from './service';

@Module({
  imports: [
    OpenMeteoModule,
    SiembrasModule,
    AlertasModule,
    NotificacionsModule,
  ],
  providers: [AgroclimaService],
  exports: [AgroclimaService],
})
export class AgroclimaModule {}
