import { Module } from '@nestjs/common';
import { PrincipioActivosService } from './service';
import { PrincipioActivosController } from './controller';
import { PrincipioActivosRepository } from './repository';
import { PrincipioActivo, PrincipioActivoSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [PrincipioActivosController],
  providers: [PrincipioActivosService, PrincipioActivosRepository],
  exports: [PrincipioActivosService],
  imports: [
    MongooseModule.forFeature([
      { name: PrincipioActivo.name, schema: PrincipioActivoSchema },
    ]),
  ],
})
export class PrincipioActivosModule {}
