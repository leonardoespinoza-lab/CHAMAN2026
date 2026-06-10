import { Module } from '@nestjs/common';
import { FertilizacionsService } from './service';
import { FertilizacionsController } from './controller';
import { FertilizacionsRepository } from './repository';
import { Fertilizacion, FertilizacionSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [FertilizacionsController],
  providers: [FertilizacionsService, FertilizacionsRepository],
  exports: [FertilizacionsService],
  imports: [
    MongooseModule.forFeature([
      { name: Fertilizacion.name, schema: FertilizacionSchema },
    ]),
  ],
})
export class FertilizacionsModule {}
