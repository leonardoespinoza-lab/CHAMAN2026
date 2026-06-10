import { Module } from '@nestjs/common';
import { NotificacionsService } from './service';
import { NotificacionController } from './controller';
import { NotificacionsRepository } from './repository';
import { Notificacion, NotificacionSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [NotificacionController],
  providers: [NotificacionsService, NotificacionsRepository],
  exports: [NotificacionsService],
  imports: [
    MongooseModule.forFeature([
      { name: Notificacion.name, schema: NotificacionSchema },
    ]),
  ],
})
export class NotificacionsModule {}
