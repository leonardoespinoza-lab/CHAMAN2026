import { forwardRef, Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { AlertasModule } from '../alerta/module';
import { SiembrasModule } from '../siembra/module';
import { FotosService } from './service';
import { FotosRepository } from './repository';
import { FotosController } from './controller';
import { VisitasLoteModule } from '../visita-lote/module';

@Module({
  imports: [AxiosModule, AlertasModule, forwardRef(() => SiembrasModule), VisitasLoteModule],
  controllers: [FotosController],
  providers: [FotosService, FotosRepository],
  exports: [FotosService],
})
export class FotosModule {}
