import { Module } from '@nestjs/common';
import { HealthModule } from './auxiliares/health/health.module';
import { CronModule } from './entidades/cron/cron.module';
import { CronosModule } from './entidades/crono/module';
import { PrediccionsModule } from './entidades/prediccion/module';
import { SiembrasModule } from './entidades/siembra/module';
import { ScheduleModule } from '@nestjs/schedule';
import { AlertasModule } from './entidades/alerta/module';
import { FumigacionsModule } from './entidades/fumigacion/module';
import { RiegoModule } from './entidades/riego/module';

@Module({
  imports: [
    HealthModule,
    CronosModule,
    SiembrasModule,
    PrediccionsModule,
    ScheduleModule.forRoot(),
    CronModule,
    AlertasModule,
    FumigacionsModule,
    RiegoModule,
  ],
})
export class AppModule {}
