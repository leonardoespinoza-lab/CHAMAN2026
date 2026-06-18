import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SueloInta, SueloIntaSchema } from './modelos/schema';
import { SuelosIntaController } from './controller';
import { SuelosIntaRepository } from './repository';
import { SuelosIntaService } from './service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SueloInta.name, schema: SueloIntaSchema },
    ]),
  ],
  controllers: [SuelosIntaController],
  providers: [SuelosIntaService, SuelosIntaRepository],
  exports: [SuelosIntaService],
})
export class SuelosIntaModule {}
