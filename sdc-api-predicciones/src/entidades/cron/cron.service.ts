import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, CronOptions } from '@nestjs/schedule';
import { PrediccionsService } from '../prediccion/service';
import { SiembrasService } from '../siembra/service';
import { RiegoService } from '../riego/service';
import {
  PREDICCIONES_AGROCLIMA_CRON_ENABLED,
  PREDICCIONES_MALEZAS_CRON_ENABLED,
  RIEGO_CRON_ENABLED,
} from '../../env';
import { AgroclimaService } from '../agroclima/service';

const CRON_OPTIONS: CronOptions = {
  timeZone: 'America/Argentina/Buenos_Aires',
};

@Injectable()
export class CronService {
  constructor(
    private siembrasService: SiembrasService,
    private prediccionsService: PrediccionsService,
    private riegoService: RiegoService,
    private agroclimaService: AgroclimaService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_5AM, CRON_OPTIONS)
  async hacerPredicciones() {
    const siembras =
      await this.siembrasService.listarSiembrasParaPredicciones();
    Logger.log(`Iniciando Predicciones para ${siembras.length} siembras`);
    await Promise.all(
      siembras.map(async (s) => {
        return await this.prediccionsService.prediccion(s._id);
      }),
    );
    Logger.log('Predicciones realizadas');
  }

  // Todos los dias a las 05:30
  @Cron('30 5 * * *', CRON_OPTIONS)
  async hacerPrediccionesMalezas() {
    if (!PREDICCIONES_MALEZAS_CRON_ENABLED) {
      Logger.log('Predicciones de malezas automaticas deshabilitadas');
      return;
    }
    await this.prediccionsService.hacerPrediccionesMalezas();
  }

  // Todos los dias a las 06:00
  @Cron('0 6 * * *', CRON_OPTIONS)
  async hacerPrediccionesAgroclima() {
    if (!PREDICCIONES_AGROCLIMA_CRON_ENABLED) {
      Logger.log('Riesgos agroclimaticos automaticos deshabilitados');
      return;
    }
    await this.agroclimaService.hacerPredicciones();
  }

  // Todos los dias a las 09:30
  @Cron('30 9 * * *', CRON_OPTIONS)
  async hacerPrediccionesRiego() {
    if (!RIEGO_CRON_ENABLED) {
      Logger.log('Predicciones de riego automaticas deshabilitadas');
      return;
    }
    const siembras =
      await this.siembrasService.listarSiembrasParaPredicciones();
    Logger.log(
      `Iniciando Predicciones de riego para ${siembras.length} siembras`,
    );
    await Promise.all(
      siembras.map(async (s) => {
        return await this.riegoService.prediccion(s._id);
      }),
    );
    Logger.log('Predicciones riego realizadas');
  }
}
