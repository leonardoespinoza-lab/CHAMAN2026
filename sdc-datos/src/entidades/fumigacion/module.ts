import { Module } from '@nestjs/common';
import { FumigacionsService } from './service';
import { FumigacionsController } from './controller';
import { FumigacionsRepository } from './repository';
import { Fumigacion, FumigacionSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [FumigacionsController],
  providers: [FumigacionsService, FumigacionsRepository],
  exports: [FumigacionsService],
  imports: [
    MongooseModule.forFeature([
      { name: Fumigacion.name, schema: FumigacionSchema },
    ]),
  ],
})
export class FumigacionsModule {}
