import { Module } from '@nestjs/common';
import { HealthModule } from './auxiliares/health/health.module';
import { CronModule } from './auxiliares/cron/cron.module';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { SchedulerModule } from './auxiliares/scheduler/scheduler.module';
import { REDIS_DB, REDIS_HOST, REDIS_PORT } from './env';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { RedisConfigService } from './auxiliares/redis-config.service';
import { ApiCheckService } from './auxiliares/api-check/api-check.service';
import { ApiCheckModule } from './auxiliares/api-check/api-check.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    RedisModule.forRootAsync({
      useClass: RedisConfigService,
    }),
    BullModule.forRoot({
      connection: {
        host: REDIS_HOST,
        port: +REDIS_PORT,
        db: REDIS_DB,
      },
    }),
    ////
    ApiCheckModule,
    HealthModule,
    CronModule,
    SchedulerModule,
    //
  ],
  controllers: [],
  providers: [],
})
export class AppModule {
  constructor(private checkApi: ApiCheckService) {
    this.checkApi.checkApis();
  }
}
