import { Module } from '@nestjs/common';
import { SiembrasService } from './service';
import { SiembrasController } from './controller';
import { SiembrasRepository } from './repository';
import { Siembra, SiembraSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [SiembrasController],
  providers: [SiembrasService, SiembrasRepository],
  exports: [SiembrasService],
  imports: [
    MongooseModule.forFeature([{ name: Siembra.name, schema: SiembraSchema }]),
  ],
})
export class SiembrasModule {}
