import { Module } from '@nestjs/common';
import { LicenciaPorEntidadsService } from './service';
import { LicenciaPorEntidadsController } from './controller';
import { LicenciaPorEntidadsRepository } from './repository';
import { LicenciaPorEntidad, LicenciaPorEntidadSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [LicenciaPorEntidadsController],
  providers: [LicenciaPorEntidadsService, LicenciaPorEntidadsRepository],
  exports: [LicenciaPorEntidadsService],
  imports: [
    MongooseModule.forFeature([
      { name: LicenciaPorEntidad.name, schema: LicenciaPorEntidadSchema },
    ]),
  ],
})
export class LicenciaPorEntidadsModule {}
