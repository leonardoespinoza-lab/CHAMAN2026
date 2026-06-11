import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MalezasController } from './controller';
import { Maleza, MalezaSchema } from './modelos/schema';
import { MalezasRepository } from './repository';
import { MalezasService } from './service';

@Module({
  controllers: [MalezasController],
  providers: [MalezasService, MalezasRepository],
  exports: [MalezasService],
  imports: [
    MongooseModule.forFeature([{ name: Maleza.name, schema: MalezaSchema }]),
  ],
})
export class MalezasModule {}
