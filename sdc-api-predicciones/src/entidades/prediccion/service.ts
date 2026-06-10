import { Injectable, Logger } from '@nestjs/common';
import { SiembrasService } from '../siembra/service';
import { PrediccionSojaService } from './cultivos/soja';
import { PrediccionTrigoService } from './cultivos/trigo';
import { NotificacionsService } from '../notificacion/service';
import {
  ICreateAlerta,
  IPrediccion,
  ISiembra,
  IUpdateAlerta,
} from 'modelos/src';
import { AlertasService } from '../alerta/service';
import { PrediccionMaizService } from './cultivos/maiz';

@Injectable()
export class PrediccionsService {
  private logger = new Logger(PrediccionsService.name);
  constructor(
    private siembrasService: SiembrasService,
    private prediccionTrigoService: PrediccionTrigoService,
    private prediccionSojaService: PrediccionSojaService,
    private prediccionMaizService: PrediccionMaizService,
    private notificacionesService: NotificacionsService,
    private alertasService: AlertasService,
  ) {}

  async hacerPredicciones() {
    const siembras =
      await this.siembrasService.listarSiembrasParaPredicciones();
    Logger.log(`Iniciando Predicciones para ${siembras.length} siembras`);
    await Promise.all(
      siembras.map(async (s) => {
        return await this.prediccion(s._id);
      }),
    );
    Logger.log('Predicciones realizadas');
  }

  async prediccion(idSiembra: string): Promise<any> {
    try {
      const siembra = await this.siembrasService.getById(idSiembra);
      Logger.log(
        `Iniciando prediccion para ${siembra.semilla?.cultivo} de ciclo ${
          siembra.semilla?.ciclo
        } con fecha de siembra ${new Date(siembra.fechaSiembra).getDate()}/${
          new Date(siembra.fechaSiembra).getMonth() + 1
        }/${new Date(siembra.fechaSiembra).getFullYear()} en departamento ${
          siembra.departamento?.nombre
        } del productor ${siembra.productor?.nombre}`,
      );

      let predicciones: IPrediccion[] = [];
      switch (siembra.semilla?.cultivo) {
        case 'Trigo':
          predicciones =
            await this.prediccionTrigoService.hacerPredicciones(siembra);
          break;
        case 'Soja':
          predicciones =
            await this.prediccionSojaService.hacerPredicciones(siembra);
          break;
        case 'Maiz':
          predicciones =
            await this.prediccionMaizService.hacerPredicciones(siembra);
          break;
      }

      if (!predicciones?.length) {
        return;
      }

      try {
        await Promise.all([
          this.notificacionesService.enviarNotificaciones(
            predicciones,
            siembra,
          ),
          this.enviarAlertas(predicciones, siembra),
        ]);
      } catch (error) {
        console.error(error);
      }
      return predicciones;
    } catch (error) {
      this.logger.error(
        `Error en la prediccion de enfermedades de la siembra ${idSiembra}`,
      );
      console.error(error);
    }
  }

  private async enviarAlertas(predicciones: IPrediccion[], siembra: ISiembra) {
    const fecha = new Date().toISOString();
    for (const p of predicciones) {
      for (const e of p.enfermedades) {
        if (e.resultado >= 15) {
          const alerta = await this.alertasService.getByIdSiembraActiva(
            p.idSiembra,
          );
          if (alerta) {
            const reportes = alerta.reportes;
            reportes.push({
              fecha,
              enfermedad: e.enfermedad,
              resultado: e.resultado,
            });
            const update: IUpdateAlerta = {
              reportes,
            };
            await this.alertasService.update(alerta._id, update);
          } else {
            const create: ICreateAlerta = {
              idSiembra: p.idSiembra,
              activa: true,
              reportes: [
                {
                  fecha,
                  enfermedad: e.enfermedad,
                  resultado: e.resultado,
                },
              ],
              estadoActual: 'Nueva',
              estados: [
                {
                  fecha,
                  estado: 'Nueva',
                },
              ],
              fecha,
              idDistribuidor: siembra.idDistribuidor,
              idEstablecimiento: siembra.idEstablecimiento,
              idProductor: siembra.idProductor,
              idQuimica: siembra.idQuimica,
              descripcion: `Riesgo de Enfermedad`,
            };
            await this.alertasService.create(create);
          }
        }
      }
    }
  }
}
