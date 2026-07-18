import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  INDICADOR_AGROMETEOROLOGICO_GENERACION_MODEL,
  INDICADOR_AGROMETEOROLOGICO_GENERADO_MODEL,
  IndicadorAgrometeorologico,
  IndicadorAgrometeorologicoGeneracionSchema,
  IndicadorAgrometeorologicoGeneradoSchema,
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
      {
        name: INDICADOR_AGROMETEOROLOGICO_GENERADO_MODEL,
        schema: IndicadorAgrometeorologicoGeneradoSchema,
      },
      {
        name: INDICADOR_AGROMETEOROLOGICO_GENERACION_MODEL,
        schema: IndicadorAgrometeorologicoGeneracionSchema,
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
