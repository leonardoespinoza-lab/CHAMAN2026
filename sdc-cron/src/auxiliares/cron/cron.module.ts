import { Module } from '@nestjs/common';
import { CronService } from './cron.service';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { LotesModule } from 'src/entidades/lotes/module';
import { ReporteNDVIsModule } from 'src/entidades/reporte-ndvis/module';

@Module({
  imports: [SchedulerModule, LotesModule, ReporteNDVIsModule],
  providers: [CronService],
  exports: [CronService],
})
export class CronModule {}
