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

@Module({
  controllers: [SiembrasController],
  providers: [SiembrasService, SiembrasRepository],
  exports: [SiembrasService],
  imports: [
    MongooseModule.forFeature([{ name: Siembra.name, schema: SiembraSchema }]),
    LotesModule,
    FertilizacionsModule,
    FumigacionsModule,
    AlgoritmosModule,
  ],
})
export class SiembrasModule {}
