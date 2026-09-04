import { Module } from '@nestjs/common';
import { SiembrasService } from './service';
import { SiembrasController } from './controller';
import { SiembrasRepository } from './repository';
import { Siembra, SiembraSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';
import { LotesModule } from '../lote/module';
import { FertilizacionsModule } from '../fertilizacion/module';
import { FumigacionsModule } from '../fumigacion/module';
import { AlgoritmosModule } from '../algoritmos/module';
import { SoilIntelligenceModule } from '../suelo-inteligencia/module';
import { IndicadoresAgrometeorologicosModule } from '../indicador-agrometeorologico/module';
import { AgrometeorologiaStorageGuard } from '../../auxiliares/agrometeorologia-storage.guard';
import { PrediccionsModule } from '../prediccion/module';
import { AlertasModule } from '../alerta/module';
import { ReporteNDVIsModule } from '../reporte-ndvis/module';

@Module({
  controllers: [SiembrasController],
  providers: [
    SiembrasService,
    SiembrasRepository,
    AgrometeorologiaStorageGuard,
  ],
  exports: [SiembrasService],
  imports: [
    MongooseModule.forFeature([{ name: Siembra.name, schema: SiembraSchema }]),
    LotesModule,
    FertilizacionsModule,
    FumigacionsModule,
    AlgoritmosModule,
    SoilIntelligenceModule,
    IndicadoresAgrometeorologicosModule,
    PrediccionsModule,
    AlertasModule,
    ReporteNDVIsModule,
  ],
})
export class SiembrasModule {}
