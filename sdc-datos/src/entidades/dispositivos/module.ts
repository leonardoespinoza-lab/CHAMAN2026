import { Module } from '@nestjs/common';
import { DispositivosService } from './service';
import { DispositivosController } from './controller';
import { DispositivosRepository } from './repository';
import { Dispositivo, DispositivoSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [DispositivosController],
  providers: [DispositivosService, DispositivosRepository],
  exports: [DispositivosService],
  imports: [
    MongooseModule.forFeature([
      { name: Dispositivo.name, schema: DispositivoSchema },
    ]),
  ],
})
export class DispositivosModule {}
