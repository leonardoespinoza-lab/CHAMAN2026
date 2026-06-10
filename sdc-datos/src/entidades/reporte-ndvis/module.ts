import { Module } from '@nestjs/common';
import { ReporteNDVIsService } from './service';
import { ReporteNDVIsController } from './controller';
import { ReporteNDVIsRepository } from './repository';
import { ReporteNDVI, ReporteNDVISchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [ReporteNDVIsController],
  providers: [ReporteNDVIsService, ReporteNDVIsRepository],
  exports: [ReporteNDVIsService],
  imports: [
    MongooseModule.forFeature([
      { name: ReporteNDVI.name, schema: ReporteNDVISchema },
    ]),
  ],
})
export class ReporteNDVIsModule {}
