import { Module } from '@nestjs/common';
import { EstacionsService } from './service';
import { EstacionsController } from './controller';
import { EstacionsRepository } from './repository';
import { MongooseModule } from '@nestjs/mongoose';
import { Estacion, EstacionSchema } from './schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Estacion.name, schema: EstacionSchema },
    ]),
  ],
  controllers: [EstacionsController],
  providers: [EstacionsService, EstacionsRepository],
  exports: [EstacionsService],
})
export class EstacionsModule {}
