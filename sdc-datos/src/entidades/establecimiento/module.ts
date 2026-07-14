import { Module } from '@nestjs/common';
import { EstablecimientosService } from './service';
import { EstablecimientosController } from './controller';
import { EstablecimientosRepository } from './repository';
import { Establecimiento, EstablecimientoSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';
import { LotLocationModule } from '../ubicacion-lote/module';

@Module({
  controllers: [EstablecimientosController],
  providers: [EstablecimientosService, EstablecimientosRepository],
  exports: [EstablecimientosService],
  imports: [
    MongooseModule.forFeature([
      { name: Establecimiento.name, schema: EstablecimientoSchema },
    ]),
    LotLocationModule,
  ],
})
export class EstablecimientosModule {}
