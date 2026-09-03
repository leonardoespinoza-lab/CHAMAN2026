import { Module } from '@nestjs/common';
import { PrediccionsService } from './service';
import { PrediccionsController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { SiembrasModule } from '../siembra/module';
import { CronosModule } from '../crono/module';
import { FusariumDeLaEspigaService } from './enfermedades/fusarium_de_la_espiga';
import { ManchaAmarillaService } from './enfermedades/mancha_amarilla';
import { ManchaDeLaHojaService } from './enfermedades/mancha_de_la_hoja';
import { RoyaDeLaHojaService } from './enfermedades/roya_de_la_hoja';
import { PrediccionsRepository } from './repository';
import { PrediccionTrigoService } from './cultivos/trigo';
import { PrediccionSojaService } from './cultivos/soja';
import { FinCicloSojaService } from './enfermedades/fin_ciclo_soja';
import { ClimaModule } from '../clima/module';
import { NotificacionsModule } from '../notificacion/module';
import { AlertasModule } from '../alerta/module';
import { FumigacionsModule } from '../fumigacion/module';
import { PrediccionMaizService } from './cultivos/maiz';
import { RoyaDelMaizService } from './enfermedades/roya_del_maiz';
import { RoyaAnaranjadaService } from './enfermedades/roya_anaranjada';
import { AgroclimaModule } from '../agroclima/module';
import { PrediccionCebadaService } from './cultivos/cebada';
import { PrediccionArvejaService } from './cultivos/arveja';
import { PrediccionFrutalesService } from './cultivos/frutales';

@Module({
  imports: [
    AxiosModule,
    SiembrasModule,
    CronosModule,
    ClimaModule,
    NotificacionsModule,
    AlertasModule,
    FumigacionsModule,
    AgroclimaModule,
  ],
  controllers: [PrediccionsController],
  providers: [
    PrediccionsRepository,
    PrediccionsService,
    // Predicciones
    PrediccionTrigoService,
    PrediccionSojaService,
    PrediccionMaizService,
    PrediccionCebadaService,
    PrediccionArvejaService,
    PrediccionFrutalesService,
    // Endermedades Trigo
    FusariumDeLaEspigaService,
    ManchaAmarillaService,
    ManchaDeLaHojaService,
    RoyaDeLaHojaService,
    // Enfermedades Soja
    FinCicloSojaService,
    // Enfermedades Maiz
    RoyaDelMaizService,
    RoyaAnaranjadaService,
  ],
  exports: [PrediccionsService],
})
export class PrediccionsModule {}
