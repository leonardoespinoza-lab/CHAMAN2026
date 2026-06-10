import { Module } from '@nestjs/common';
import { PrediccionsService } from './service';
import { PrediccionsController } from './controller';
import { PrediccionsRepository } from './repository';
import { Prediccion, PrediccionSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [PrediccionsController],
  providers: [PrediccionsService, PrediccionsRepository],
  exports: [PrediccionsService],
  imports: [
    MongooseModule.forFeature([
      { name: Prediccion.name, schema: PrediccionSchema },
    ]),
  ],
})
export class PrediccionsModule {}
