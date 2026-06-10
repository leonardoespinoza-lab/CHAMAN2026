import { Module } from '@nestjs/common';
import { AlertasService } from './service';
import { AlertasController } from './controller';
import { AlertasRepository } from './repository';
import { Alerta, AlertaSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [AlertasController],
  providers: [AlertasService, AlertasRepository],
  exports: [AlertasService],
  imports: [
    MongooseModule.forFeature([{ name: Alerta.name, schema: AlertaSchema }]),
  ],
})
export class AlertasModule {}
