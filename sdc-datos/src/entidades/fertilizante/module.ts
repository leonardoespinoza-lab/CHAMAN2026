import { Module } from '@nestjs/common';
import { FertilizantesService } from './service';
import { FertilizantesController } from './controller';
import { FertilizantesRepository } from './repository';
import { Fertilizante, FertilizanteSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [FertilizantesController],
  providers: [FertilizantesService, FertilizantesRepository],
  exports: [FertilizantesService],
  imports: [
    MongooseModule.forFeature([
      { name: Fertilizante.name, schema: FertilizanteSchema },
    ]),
  ],
})
export class FertilizantesModule {}
