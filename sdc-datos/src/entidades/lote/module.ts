import { Module } from '@nestjs/common';
import { LotesService } from './service';
import { LotesController } from './controller';
import { LotesRepository } from './repository';
import { Lote, LoteSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';
import { LotLocationModule } from '../ubicacion-lote/module';
import { SoilIntelligenceModule } from '../suelo-inteligencia/module';
import { Dispositivo, DispositivoSchema } from '../dispositivos/modelos/schema';

@Module({
  controllers: [LotesController],
  providers: [LotesService, LotesRepository],
  exports: [LotesService],
  imports: [
    MongooseModule.forFeature([
      { name: Lote.name, schema: LoteSchema },
      { name: Dispositivo.name, schema: DispositivoSchema },
    ]),
    LotLocationModule,
    SoilIntelligenceModule,
  ],
})
export class LotesModule {}
