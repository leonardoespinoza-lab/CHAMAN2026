import { Module } from '@nestjs/common';
import { LicenciasService } from './service';
import { LicenciasController } from './controller';
import { LicenciasRepository } from './repository';
import { Licencia, LicenciaSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [LicenciasController],
  providers: [LicenciasService, LicenciasRepository],
  exports: [LicenciasService],
  imports: [
    MongooseModule.forFeature([
      { name: Licencia.name, schema: LicenciaSchema },
    ]),
  ],
})
export class LicenciasModule {}
