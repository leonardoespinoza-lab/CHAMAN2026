import { Module } from '@nestjs/common';
import { AgroquimicosService } from './service';
import { AgroquimicosController } from './controller';
import { AgroquimicosRepository } from './repository';
import { Agroquimico, AgroquimicoSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [AgroquimicosController],
  providers: [AgroquimicosService, AgroquimicosRepository],
  exports: [AgroquimicosService],
  imports: [
    MongooseModule.forFeature([
      { name: Agroquimico.name, schema: AgroquimicoSchema },
    ]),
  ],
})
export class AgroquimicosModule {}
