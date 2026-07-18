import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { AxiosModule } from '../axios/axios.module';
import { DECISION_PIPELINE_QUEUE } from './decision-pipeline.constants';
import { DecisionPipelineQueueService } from './decision-pipeline-queue.service';
import { DecisionPipelineProcessor } from './decision-pipeline.processor';
import { DecisionPipelineRepository } from './decision-pipeline.repository';

@Module({
  imports: [
    BullModule.registerQueue({ name: DECISION_PIPELINE_QUEUE }),
    AxiosModule,
  ],
  providers: [
    DecisionPipelineQueueService,
    DecisionPipelineProcessor,
    DecisionPipelineRepository,
  ],
  exports: [DecisionPipelineQueueService],
})
export class DecisionPipelineModule {}
