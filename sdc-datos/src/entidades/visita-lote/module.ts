import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VisitaLote, VisitaLoteSchema } from './modelos/schema';
import { VisitasLoteController } from './controller';
import { VisitasLoteRepository } from './repository';
import { VisitasLoteService } from './service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VisitaLote.name, schema: VisitaLoteSchema },
    ]),
  ],
  controllers: [VisitasLoteController],
  providers: [VisitasLoteService, VisitasLoteRepository],
  exports: [VisitasLoteService],
})
export class VisitasLoteModule {}
