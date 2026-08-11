import { Module } from '@nestjs/common';
import { AlgoritmosController } from './controller';
import { AlgoritmosService } from './service';
import { CronosModule } from '../crono/module';
import { EnfermedadsModule } from '../enfermedad/module';
import { MalezasModule } from '../maleza/module';
import { SemillasModule } from '../semilla/module';
import { OpenMeteoModule } from '../../auxiliares/open-meteo/open-meteo.module';

@Module({
  imports: [
    CronosModule,
    EnfermedadsModule,
    MalezasModule,
    SemillasModule,
    OpenMeteoModule,
  ],
  controllers: [AlgoritmosController],
  providers: [AlgoritmosService],
  exports: [AlgoritmosService],
})
export class AlgoritmosModule {}
