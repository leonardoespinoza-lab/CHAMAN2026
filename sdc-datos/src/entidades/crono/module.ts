import { Module } from '@nestjs/common';
import { CronosService } from './service';
import { CronoController } from './controller';
import { CronosRepository } from './repository';
import { Crono, CronoSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [CronoController],
  providers: [CronosService, CronosRepository],
  exports: [CronosService],
  imports: [
    MongooseModule.forFeature([{ name: Crono.name, schema: CronoSchema }]),
  ],
})
export class CronosModule {}
