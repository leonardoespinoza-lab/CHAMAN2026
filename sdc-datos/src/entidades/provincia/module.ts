import { Module } from '@nestjs/common';
import { ProvinciasService } from './service';
import { ProvinciasController } from './controller';
import { ProvinciasRepository } from './repository';
import { Provincia, ProvinciaSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [ProvinciasController],
  providers: [ProvinciasService, ProvinciasRepository],
  exports: [ProvinciasService],
  imports: [
    MongooseModule.forFeature([
      { name: Provincia.name, schema: ProvinciaSchema },
    ]),
  ],
})
export class ProvinciasModule {}
