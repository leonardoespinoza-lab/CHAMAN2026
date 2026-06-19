import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CamarasController } from './controller';
import { Camara, CamaraSchema } from './modelos/schema';
import { CamarasRepository } from './repository';
import { CamarasService } from './service';

@Module({
  controllers: [CamarasController],
  providers: [CamarasService, CamarasRepository],
  exports: [CamarasService],
  imports: [
    MongooseModule.forFeature([{ name: Camara.name, schema: CamaraSchema }]),
  ],
})
export class CamarasModule {}
