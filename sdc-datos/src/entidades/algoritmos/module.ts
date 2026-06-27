import { Module } from '@nestjs/common';
import { AlgoritmosController } from './controller';
import { AlgoritmosService } from './service';
import { MalezasModule } from '../maleza/module';

@Module({
  imports: [MalezasModule],
  controllers: [AlgoritmosController],
  providers: [AlgoritmosService],
  exports: [AlgoritmosService],
})
export class AlgoritmosModule {}
