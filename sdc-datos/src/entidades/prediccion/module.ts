import { Module } from '@nestjs/common';
import { PrediccionsService } from './service';
import { PrediccionsController } from './controller';
import { PrediccionsRepository } from './repository';
import { Prediccion, PrediccionSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PrediccionTombstone,
  PrediccionTombstoneSchema,
} from './modelos/tombstone.schema';
import { Siembra, SiembraSchema } from '../siembra/modelos/schema';

@Module({
  controllers: [PrediccionsController],
  providers: [PrediccionsService, PrediccionsRepository],
  exports: [PrediccionsService],
  imports: [
    MongooseModule.forFeature([
      { name: Prediccion.name, schema: PrediccionSchema },
      {
        name: PrediccionTombstone.name,
        schema: PrediccionTombstoneSchema,
      },
      { name: Siembra.name, schema: SiembraSchema },
    ]),
  ],
})
export class PrediccionsModule {}
