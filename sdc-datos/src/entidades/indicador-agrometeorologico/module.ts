import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  IndicadorAgrometeorologico,
  IndicadorAgrometeorologicoSchema,
} from './modelos/schema';
import { IndicadoresAgrometeorologicosController } from './controller';
import { IndicadoresAgrometeorologicosRepository } from './repository';
import { IndicadoresAgrometeorologicosService } from './service';
import { AgrometeorologiaStorageGuard } from '../../auxiliares/agrometeorologia-storage.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: IndicadorAgrometeorologico.name,
        schema: IndicadorAgrometeorologicoSchema,
      },
    ]),
  ],
  controllers: [IndicadoresAgrometeorologicosController],
  providers: [
    IndicadoresAgrometeorologicosService,
    IndicadoresAgrometeorologicosRepository,
    AgrometeorologiaStorageGuard,
  ],
  exports: [IndicadoresAgrometeorologicosService],
})
export class IndicadoresAgrometeorologicosModule {}
