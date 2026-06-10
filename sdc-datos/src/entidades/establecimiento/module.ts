import { Module } from '@nestjs/common';
import { EstablecimientosService } from './service';
import { EstablecimientosController } from './controller';
import { EstablecimientosRepository } from './repository';
import { Establecimiento, EstablecimientoSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [EstablecimientosController],
  providers: [EstablecimientosService, EstablecimientosRepository],
  exports: [EstablecimientosService],
  imports: [
    MongooseModule.forFeature([
      { name: Establecimiento.name, schema: EstablecimientoSchema },
    ]),
  ],
})
export class EstablecimientosModule {}
