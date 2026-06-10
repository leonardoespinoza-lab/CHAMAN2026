import { Module } from '@nestjs/common';
import { PrediccionRiegosService } from './service';
import { PrediccionRiegosController } from './controller';
import { PrediccionRiegosRepository } from './repository';
import { PrediccionRiego, PrediccionRiegoSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [PrediccionRiegosController],
  providers: [PrediccionRiegosService, PrediccionRiegosRepository],
  exports: [PrediccionRiegosService],
  imports: [
    MongooseModule.forFeature([
      { name: PrediccionRiego.name, schema: PrediccionRiegoSchema },
    ]),
  ],
})
export class PrediccionRiegosModule {}
