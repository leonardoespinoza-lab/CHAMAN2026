import { Module } from '@nestjs/common';
import { DispositivosService } from './service';
import { DispositivosController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { DispositivosRepository } from './repository';
import { DecisionPipelineModule } from '../../auxiliares/decision-pipeline';

@Module({
  imports: [AxiosModule, DecisionPipelineModule],
  controllers: [DispositivosController],
  providers: [DispositivosService, DispositivosRepository],
  exports: [DispositivosService],
})
export class DispositivosModule {}
