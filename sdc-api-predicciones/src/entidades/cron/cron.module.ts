import { Module } from '@nestjs/common';
import { PrediccionsModule } from '../prediccion/module';
import { SiembrasModule } from '../siembra/module';
import { CronService } from './cron.service';
import { RiegoModule } from '../riego/module';
import { AgroclimaModule } from '../agroclima/module';

@Module({
  imports: [SiembrasModule, PrediccionsModule, RiegoModule, AgroclimaModule],
  providers: [CronService],
  exports: [CronService],
})
export class CronModule {}
