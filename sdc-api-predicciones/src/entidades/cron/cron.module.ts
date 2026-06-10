import { Module } from '@nestjs/common';
import { PrediccionsModule } from '../prediccion/module';
import { SiembrasModule } from '../siembra/module';
import { CronService } from './cron.service';
import { RiegoModule } from '../riego/module';

@Module({
  imports: [SiembrasModule, PrediccionsModule, RiegoModule],
  providers: [CronService],
  exports: [CronService],
})
export class CronModule {}
