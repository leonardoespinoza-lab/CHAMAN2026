import { Module } from '@nestjs/common';
import { FotosService } from './service';
import { FotosController } from './controller';
import { FotosRepository } from './repository';
import { Foto, FotoSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [FotosController],
  providers: [FotosService, FotosRepository],
  exports: [FotosService],
  imports: [
    MongooseModule.forFeature([{ name: Foto.name, schema: FotoSchema }]),
  ],
})
export class FotosModule {}
