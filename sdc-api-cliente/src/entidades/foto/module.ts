import { forwardRef, Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { AlertasModule } from '../alerta/module';
import { SiembrasModule } from '../siembra/module';
import { FotosService } from './service';
import { FotosRepository } from './repository';
import { FotosController } from './controller';

@Module({
  imports: [AxiosModule, AlertasModule, forwardRef(() => SiembrasModule)],
  controllers: [FotosController],
  providers: [FotosService, FotosRepository],
  exports: [FotosService],
})
export class FotosModule {}
