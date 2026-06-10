import { Module } from '@nestjs/common';
import { QuimicasService } from './service';
import { QuimicasController } from './controller';
import { QuimicasRepository } from './repository';
import { Quimica, QuimicaSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [QuimicasController],
  providers: [QuimicasService, QuimicasRepository],
  exports: [QuimicasService],
  imports: [
    MongooseModule.forFeature([{ name: Quimica.name, schema: QuimicaSchema }]),
  ],
})
export class QuimicasModule {}
