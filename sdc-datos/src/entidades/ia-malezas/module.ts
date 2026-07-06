import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IaMalezasController } from './controller';
import {
  IaMalezaAnalisis,
  IaMalezaAnalisisSchema,
} from './modelos/schema';
import { IaMalezasRepository } from './repository';
import { IaMalezasService } from './service';

@Module({
  controllers: [IaMalezasController],
  providers: [IaMalezasService, IaMalezasRepository],
  exports: [IaMalezasService],
  imports: [
    MongooseModule.forFeature([
      { name: IaMalezaAnalisis.name, schema: IaMalezaAnalisisSchema },
    ]),
  ],
})
export class IaMalezasModule {}
