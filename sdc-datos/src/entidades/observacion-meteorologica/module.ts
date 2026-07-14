import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ObservacionMeteorologica,
  ObservacionMeteorologicaSchema,
} from './modelos/schema';
import { ObservacionesMeteorologicasController } from './controller';
import { ObservacionesMeteorologicasRepository } from './repository';
import { ObservacionesMeteorologicasService } from './service';
import { AgrometeorologiaStorageGuard } from '../../auxiliares/agrometeorologia-storage.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ObservacionMeteorologica.name,
        schema: ObservacionMeteorologicaSchema,
      },
    ]),
  ],
  controllers: [ObservacionesMeteorologicasController],
  providers: [
    ObservacionesMeteorologicasService,
    ObservacionesMeteorologicasRepository,
    AgrometeorologiaStorageGuard,
  ],
  exports: [ObservacionesMeteorologicasService],
})
export class ObservacionesMeteorologicasModule {}
