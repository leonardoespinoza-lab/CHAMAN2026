import { Module } from '@nestjs/common';
import { AlgoritmosController } from './controller';
import { AlgoritmosService } from './service';
import { CronosModule } from '../crono/module';
import { EnfermedadsModule } from '../enfermedad/module';
import { MalezasModule } from '../maleza/module';
import { SemillasModule } from '../semilla/module';

@Module({
  imports: [CronosModule, EnfermedadsModule, MalezasModule, SemillasModule],
  controllers: [AlgoritmosController],
  providers: [AlgoritmosService],
  exports: [AlgoritmosService],
})
export class AlgoritmosModule {}
