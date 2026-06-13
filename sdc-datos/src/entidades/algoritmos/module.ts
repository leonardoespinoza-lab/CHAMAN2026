import { Module } from '@nestjs/common';
import { AlgoritmosController } from './controller';
import { AlgoritmosService } from './service';

@Module({
  controllers: [AlgoritmosController],
  providers: [AlgoritmosService],
  exports: [AlgoritmosService],
})
export class AlgoritmosModule {}
