import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { BullModule, RegisterQueueOptions } from '@nestjs/bullmq';
import { NDVIProcessor } from './scheduler.processor';

/// Acá declarás los queues que vas a usar.
const queue: RegisterQueueOptions[] = [{ name: 'tareas-ndvi' }];
@Module({
  imports: [BullModule.registerQueue(...queue)],
  // Acá agregás los processors (Uno por cada queue).
  providers: [SchedulerService, NDVIProcessor],
  exports: [SchedulerService],
  controllers: [SchedulerController],
})
export class SchedulerModule {}
