import { Module } from '@nestjs/common';
import { SemillasService } from './service';
import { SemillasController } from './controller';
import { SemillasRepository } from './repository';
import { Semilla, SemillaSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogImportService } from './catalog-import.service';

@Module({
  controllers: [SemillasController],
  providers: [SemillasService, SemillasRepository, CatalogImportService],
  exports: [SemillasService],
  imports: [
    MongooseModule.forFeature([{ name: Semilla.name, schema: SemillaSchema }]),
  ],
})
export class SemillasModule {}
