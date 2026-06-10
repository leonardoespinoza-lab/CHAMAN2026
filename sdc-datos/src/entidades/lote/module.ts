import { Module } from '@nestjs/common';
import { LotesService } from './service';
import { LotesController } from './controller';
import { LotesRepository } from './repository';
import { Lote, LoteSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [LotesController],
  providers: [LotesService, LotesRepository],
  exports: [LotesService],
  imports: [
    MongooseModule.forFeature([{ name: Lote.name, schema: LoteSchema }]),
  ],
})
export class LotesModule {}
