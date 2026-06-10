import { Module, RequestMethod } from '@nestjs/common';
import {
  MiddlewareConsumer,
  NestModule,
  RouteInfo,
} from '@nestjs/common/interfaces';
import { AuthenticationMiddleware } from './auxiliares/authentication/middleware';
import { HealthModule } from './auxiliares/health/health.module';
import { AuthenticationModule } from './auxiliares/authentication/module';
import { ApikeysModule } from './entidades/apikey/module';
import { EndpointsModule } from './endpoints/module';
import { ApiCheckService } from './auxiliares/api-check/api-check.service';
import { ApiCheckModule } from './auxiliares/api-check/api-check.module';
import { EndpointsInternosModule } from './endpoints-internos/module';

@Module({
  imports: [
    HealthModule,
    AuthenticationModule,
    ApiCheckModule,
    //
    ApikeysModule,
    EndpointsModule,
    EndpointsInternosModule,
  ],
  controllers: [],
})
export class AppModule implements NestModule {
  private excludeAuth: RouteInfo[] = [
    {
      method: RequestMethod.GET,
      path: `/health`,
    },
    {
      method: RequestMethod.POST,
      path: `/ndvi/crear-reporte`,
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
