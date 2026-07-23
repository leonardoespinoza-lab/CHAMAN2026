import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { FieldClimateIntegracionController } from './controller';
import { FieldClimateIntegracionRepository } from './repository';
import { FieldClimateIntegracionService } from './service';
import { DecisionPipelineModule } from '../../auxiliares/decision-pipeline';

@Module({
  imports: [AxiosModule, DecisionPipelineModule],
  controllers: [FieldClimateIntegracionController],
  providers: [
    FieldClimateIntegracionService,
    FieldClimateIntegracionRepository,
  ],
})
export class FieldClimateIntegracionModule {}
