import { Module, RequestMethod } from '@nestjs/common';
import {
  MiddlewareConsumer,
  NestModule,
  RouteInfo,
} from '@nestjs/common/interfaces';
import { BullModule } from '@nestjs/bull';
import { AuthenticationMiddleware } from './auxiliares/authentication/authentication.middleware';
import { AuthenticationModule } from './auxiliares/authentication/authentication.module';
import { HealthModule } from './auxiliares/health/health.module';
import { MqttModule } from './auxiliares/mqtt/mqtt.module';
import { UsuariosModule } from './entidades/usuario/module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MqttInterceptor } from './auxiliares/mqtt/mqtt.interceptor';
import { DistribuidorsModule } from './entidades/distribuidor/module';
import { QuimicasModule } from './entidades/quimica/module';
import { ProductorsModule } from './entidades/productor/module';
import { SiembrasModule } from './entidades/siembra/module';
import { PrediccionsModule } from './entidades/prediccion/module';
import { CronosModule } from './entidades/crono/module';
import { DepartamentosModule } from './entidades/departamento/module';
import { AgroquimicosModule } from './entidades/agroquimico/module';
import { EmpresasModule } from './entidades/empresa/module';
import { EstablecimientosModule } from './entidades/establecimiento/module';
import { FumigacionsModule } from './entidades/fumigacion/module';
import { LotesModule } from './entidades/lote/module';
import { SemillasModule } from './entidades/semilla/module';
import { ClimaModule } from './entidades/clima/module';
import { TokenPushsModule } from './entidades/tokenPush/module';
import { NotificacionesModule } from './entidades/notificaciones/module';
import { AlertasModule } from './entidades/alerta/module';
import { EstacionsModule } from './entidades/estacion/module';
import { ApikeysModule } from './entidades/apikey/module';
import { FertilizacionsModule } from './entidades/fertilizacion/module';
import { FertilizantesModule } from './entidades/fertilizante/module';
import { PrincipioActivosModule } from './entidades/principio-activo/module';
import { ApiCheckModule } from './auxiliares/api-check/api-check.module';
import { ApiCheckService } from './auxiliares/api-check/api-check.service';
import { ReporteNDVIsModule } from './entidades/reporte-ndvis/module';
import { LicenciasModule } from './entidades/licencia/module';
import { LicenciaPorEntidadsModule } from './entidades/licenciaPorEntidad/module';
import { ReportesModule } from './entidades/reportes/module';
import { DispositivosModule } from './entidades/dispositivos/module';
import { GeoCodeApiModule } from './auxiliares/geocode-api/geocode-api.module';
import { CacheWarmingModule } from './auxiliares/cache-warming/cache-warming.module';
import { FotosModule } from './entidades/foto/module';
import { MalezasModule } from './entidades/maleza/module';
import { LorawanUplinksModule } from './entidades/lorawan-uplinks/module';
import { AlgoritmosModule } from './entidades/algoritmos/module';
import { CamarasModule } from './entidades/camara/module';
import { FieldClimateIntegracionModule } from './entidades/fieldclimate-integracion/module';
import { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD } from './env';

@Module({
  imports: [
    // Configuración de BullMQ con Redis
    BullModule.forRoot({
      redis: {
        host: REDIS_HOST,
        port: REDIS_PORT,
        password: REDIS_PASSWORD || undefined,
      },
    }),

    // Módulos del sistema
    HealthModule,
    MqttModule,
    AuthenticationModule,
    ApiCheckModule,
    CacheWarmingModule,
    //
    AgroquimicosModule,
    ClimaModule,
    CronosModule,
    DepartamentosModule,
    DistribuidorsModule,
    EmpresasModule,
    EstablecimientosModule,
    FumigacionsModule,
    LotesModule,
    PrediccionsModule,
    ProductorsModule,
    QuimicasModule,
    SemillasModule,
    SiembrasModule,
    UsuariosModule,
    TokenPushsModule,
    NotificacionesModule,
    AlertasModule,
    EstacionsModule,
    ApikeysModule,
    FertilizacionsModule,
    FertilizantesModule,
    PrincipioActivosModule,
    ReporteNDVIsModule,
    LicenciasModule,
    LicenciaPorEntidadsModule,
    ReportesModule,
    DispositivosModule,
    GeoCodeApiModule,
    FotosModule,
    CamarasModule,
    MalezasModule,
    LorawanUplinksModule,
    AlgoritmosModule,
    FieldClimateIntegracionModule,
  ],
  controllers: [],
  providers: [{ provide: APP_INTERCEPTOR, useClass: MqttInterceptor }],
})
export class AppModule implements NestModule {
  constructor(private apiCheck: ApiCheckService) {
    this.onInit();
  }
  private excludeAuth: RouteInfo[] = [
    {
      method: RequestMethod.GET,
      path: `/health`,
    },
    {
      method: RequestMethod.POST,
      path: `/auth/login`,
    },
    {
      method: RequestMethod.POST,
      path: `/auth/refresh_token`,
    },
    {
      method: RequestMethod.POST,
      path: `/auth/access_token`,
    },
    {
      method: RequestMethod.POST,
      path: `/auth/google-login`,
    },
    {
      method: RequestMethod.POST,
      path: `/auth/google-login-apple`,
    },
  ];

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthenticationMiddleware)
      .exclude(...this.excludeAuth)
      .forRoutes('*');
  }

  private async onInit() {
    await this.apiCheck.checkApis();
  }
}
