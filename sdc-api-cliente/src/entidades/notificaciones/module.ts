import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { NotificacionesController } from './controller';
import { NotificacionesRopository } from './repository';
import { NotificacionesService } from './service';

@Module({
  imports: [AxiosModule],
  controllers: [NotificacionesController],
  providers: [NotificacionesService, NotificacionesRopository],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
