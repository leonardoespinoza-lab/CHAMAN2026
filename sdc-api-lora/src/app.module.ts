import { Module, RequestMethod } from '@nestjs/common';
import {
  MiddlewareConsumer,
  NestModule,
  RouteInfo,
} from '@nestjs/common/interfaces';
import { HealthModule } from './auxiliares/health/health.module';
import { ApiCheckService } from './auxiliares/api-check/api-check.service';
import { ApiCheckModule } from './auxiliares/api-check/api-check.module';
import { ReportesModule } from './entidades/reportes/module';
import { AuthenticationMiddleware } from './auxiliares/authentication/middleware';
import { LorawanUplinksModule } from './entidades/lorawan-uplinks/module';
import { LorawanMqttConsumerModule } from './auxiliares/lorawan-mqtt-consumer/module';
import { ChirpstackDeviceSyncModule } from './auxiliares/chirpstack-device-sync/module';

@Module({
  imports: [
    HealthModule,
    ApiCheckModule,
    //
    ReportesModule,
    LorawanUplinksModule,
    LorawanMqttConsumerModule,
    ChirpstackDeviceSyncModule,
  ],
  controllers: [],
})
export class AppModule implements NestModule {
  private excludeAuth: RouteInfo[] = [
    {
      method: RequestMethod.GET,
      path: `/health`,
    },
  ];

  constructor(private checkApi: ApiCheckService) {
    this.checkApi.checkApis();
  }

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthenticationMiddleware)
      .exclude(...this.excludeAuth)
      .forRoutes('*');
  }
}
