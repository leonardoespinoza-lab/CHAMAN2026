import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { NotificacionesRopository } from './repository';
import { NotificacionesService } from './service';

@Module({
  imports: [AxiosModule],
  providers: [NotificacionesService, NotificacionesRopository],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
