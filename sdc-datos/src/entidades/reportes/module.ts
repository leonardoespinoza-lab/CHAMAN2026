import { Module } from '@nestjs/common';
import { ReportesService } from './service';
import { ReportesController } from './controller';
import { ReportesRepository } from './repository';
import { Reporte, ReporteSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [ReportesController],
  providers: [ReportesService, ReportesRepository],
  exports: [ReportesService],
  imports: [
    MongooseModule.forFeature([{ name: Reporte.name, schema: ReporteSchema }]),
  ],
})
export class ReportesModule {}
