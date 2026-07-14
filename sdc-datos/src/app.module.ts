import { Logger, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthController } from './auxiliares/health/health.controller';
import { AgroquimicosModule } from './entidades/agroquimico/module';
import { CronosModule } from './entidades/crono/module';
import { DepartamentosModule } from './entidades/departamento/module';
import { DistribuidorsModule } from './entidades/distribuidor/module';
import { EmpresasModule } from './entidades/empresa/module';
import { EnfermedadsModule } from './entidades/enfermedad/module';
import { EstablecimientosModule } from './entidades/establecimiento/module';
import { FumigacionsModule } from './entidades/fumigacion/module';
import { LotesModule } from './entidades/lote/module';
import { OauthModule } from './entidades/oauth/oauth.module';
import { PrediccionsModule } from './entidades/prediccion/module';
import { ProductorsModule } from './entidades/productor/module';
import { ProvinciasModule } from './entidades/provincia/module';
import { QuimicasModule } from './entidades/quimica/module';
import { SemillasModule } from './entidades/semilla/module';
import { SiembrasModule } from './entidades/siembra/module';
import { UsuariosModule } from './entidades/usuario/module';
import { DB_NAME, DB_OPTIONS, DB_URL } from './env';
import { NotificacionsModule } from './entidades/notificacion/module';
import { TokenPushsModule } from './entidades/tokenPush/module';
import { AlertasModule } from './entidades/alerta/module';
import { EstacionsModule } from './entidades/estacion/module';
import { PrediccionRiegosModule } from './entidades/prediccion-riego/module';
import { ApikeysModule } from './entidades/apikey/module';
import { FertilizantesModule } from './entidades/fertilizante/module';
import { FertilizacionsModule } from './entidades/fertilizacion/module';
import { PrincipioActivosModule } from './entidades/principio-activo/module';
import { ReporteNDVIsModule } from './entidades/reporte-ndvis/module';
import { LicenciasModule } from './entidades/licencia/module';
import { LicenciaPorEntidadsModule } from './entidades/licenciaPorEntidad/module';
import { ReportesModule } from './entidades/reportes/module';
import { DispositivosModule } from './entidades/dispositivos/module';
import { FotosModule } from './entidades/foto/module';
import { CamarasModule } from './entidades/camara/module';
import { MalezasModule } from './entidades/maleza/module';
import { LorawanUplinksModule } from './entidades/lorawan-uplinks/module';
import { AlgoritmosModule } from './entidades/algoritmos/module';
import { SuelosIntaModule } from './entidades/suelo-inta/module';
import { IaMalezasModule } from './entidades/ia-malezas/module';
import { ObservacionesMeteorologicasModule } from './entidades/observacion-meteorologica/module';
import { IndicadoresAgrometeorologicosModule } from './entidades/indicador-agrometeorologico/module';
import { ScheduleModule } from '@nestjs/schedule';
import { SoilIntelligenceModule } from './entidades/suelo-inteligencia/module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forRoot(DB_URL, DB_OPTIONS),
    OauthModule,
    UsuariosModule,
    QuimicasModule,
    DistribuidorsModule,
    ProvinciasModule,
    DepartamentosModule,
    EnfermedadsModule,
    SemillasModule,
    CronosModule,
    EstablecimientosModule,
    LotesModule,
    ProductorsModule,
    SiembrasModule,
    PrediccionsModule,
    AgroquimicosModule,
    EmpresasModule,
    FumigacionsModule,
    NotificacionsModule,
    TokenPushsModule,
    AlertasModule,
    EstacionsModule,
    PrediccionRiegosModule,
    ApikeysModule,
    FertilizantesModule,
    FertilizacionsModule,
    PrincipioActivosModule,
    ReporteNDVIsModule,
    LicenciasModule,
    LicenciaPorEntidadsModule,
    ReportesModule,
    DispositivosModule,
    FotosModule,
    CamarasModule,
    MalezasModule,
    LorawanUplinksModule,
    AlgoritmosModule,
    SuelosIntaModule,
    IaMalezasModule,
    ObservacionesMeteorologicasModule,
    IndicadoresAgrometeorologicosModule,
    SoilIntelligenceModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {
  constructor() {
    Logger.verbose(`Conexión a la base de datos: ${DB_URL} ${DB_NAME}`);
  }
}
