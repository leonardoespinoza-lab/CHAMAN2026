import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { AlertasModule } from '../alerta/module';
import { NotificacionsModule } from '../notificacion/module';
import { SiembrasModule } from '../siembra/module';
import { AgroclimaService } from './service';

@Module({
  imports: [AxiosModule, SiembrasModule, AlertasModule, NotificacionsModule],
  providers: [AgroclimaService],
  exports: [AgroclimaService],
})
export class AgroclimaModule {}
