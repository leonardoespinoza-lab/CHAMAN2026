import { Injectable, Logger } from '@nestjs/common';
import { SiembrasService } from '../siembra/service';
import { PrediccionSojaService } from './cultivos/soja';
import { PrediccionTrigoService } from './cultivos/trigo';
import { NotificacionsService } from '../notificacion/service';
import {
  IPrediccion,
  ISiembra,
  IResultadoPrediccionMalezas,
} from 'modelos/src';
import { AlertasService } from '../alerta/service';
import { PrediccionMaizService } from './cultivos/maiz';
import { PREDICCIONES_MALEZAS_LIMIT } from '../../env';
import { PrediccionCebadaService } from './cultivos/cebada';

@Injectable()
export class PrediccionsService {
  private logger = new Logger(PrediccionsService.name);
  constructor(
    private siembrasService: SiembrasService,
    private prediccionTrigoService: PrediccionTrigoService,
    private prediccionSojaService: PrediccionSojaService,
    private prediccionMaizService: PrediccionMaizService,
    private prediccionCebadaService: PrediccionCebadaService,
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

  async hacerPrediccionesMalezas() {
    const siembras = await this.siembrasService.listarSiembrasParaMalezas(
      PREDICCIONES_MALEZAS_LIMIT,
    );
    Logger.log(
      `Iniciando Predicciones de malezas para ${siembras.length} siembras`,
    );

    let procesadas = 0;
    let conEvento = 0;
    for (const s of siembras) {
      try {
        const resultado = await this.prediccionMalezas(s._id);
        procesadas += 1;
        if (
          resultado?.especies?.some((especie) => especie.severidad === 'alta')
        ) {
          conEvento += 1;
        }
      } catch (error) {
        this.logger.error(`Error en prediccion de malezas ${s._id}`);
        console.error(error);
      }
    }

    Logger.log(
      `Predicciones de malezas realizadas: ${procesadas}/${siembras.length}. Eventos: ${conEvento}`,
    );
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
        case 'Cebada':
          predicciones =
            await this.prediccionCebadaService.hacerPredicciones(siembra);
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

  async prediccionMalezas(
    idSiembra: string,
  ): Promise<IResultadoPrediccionMalezas> {
    try {
      const siembra = await this.siembrasService.getById(idSiembra);
      const resultado = await this.siembrasService.prediccionMalezas(idSiembra);

      if (resultado?.estado === 'operativo') {
        await Promise.all([
          this.notificacionesService.enviarNotificacionesMalezas(
            resultado,
            siembra,
          ),
          this.enviarAlertasMalezas(resultado, siembra),
        ]);
      }

      return resultado;
    } catch (error) {
      this.logger.error(
        `Error en la prediccion de malezas de la siembra ${idSiembra}`,
      );
      console.error(error);
    }
  }

  private async enviarAlertas(predicciones: IPrediccion[], siembra: ISiembra) {
    const fecha = new Date().toISOString();
    for (const p of predicciones) {
      for (const e of p.enfermedades) {
        if (e.estado !== 'sin_datos' && e.resultado >= 15) {
          const idSiembra = p.idSiembra || siembra._id;
          await this.alertasService.registrarEventoSiembra({
            idSiembra,
            descripcion: 'Riesgo de Enfermedad',
            titulo: e.enfermedad,
            tipo: 'enfermedad',
            categoria: 'sanitaria',
            motor: 'prediccion-enfermedades',
            versionMotor: 'v3',
            lectura: `${e.enfermedad}: ${Number(e.resultado || 0).toFixed(1)}% de riesgo calculado.`,
            recomendacion:
              'Validar a campo, revisar estadio fenologico, humedad y manejo antes de definir una intervencion.',
            calidadDatos: {
              nivel:
                e.calidadDatos?.nivel === 'alta'
                  ? 'alta'
                  : e.calidadDatos?.nivel === 'baja' ||
                      e.calidadDatos?.nivel === 'sin_datos'
                    ? 'baja'
                    : 'media',
              fuente:
                e.calidadDatos?.resumen ||
                'Clima historico y fenologia del lote',
              detalle: [
                ...(e.calidadDatos?.limitaciones || []),
                `Fenologia: ${p.fuenteFenologia || 'crono'}.`,
                `Modelo: ${e.modelo?.id || e.enfermedad} v${e.modelo?.version || 3}.`,
              ].join(' '),
            },
            fecha,
            eventKey: `enfermedad:${idSiembra}:${this.slug(
              e.enfermedad,
            )}:${this.dateKey(fecha)}`,
            reporte: {
              tipo: 'enfermedad',
              enfermedad: e.enfermedad,
              resultado: e.resultado,
            },
            tenant: {
              idDistribuidor: siembra.idDistribuidor,
              idEstablecimiento: siembra.idEstablecimiento,
              idProductor: siembra.idProductor,
              idQuimica: siembra.idQuimica,
            },
          });
        }
      }
    }
  }

  private async enviarAlertasMalezas(
    resultado: IResultadoPrediccionMalezas,
    siembra: ISiembra,
  ) {
    const fecha = resultado.fecha || new Date().toISOString();
    const idSiembra = resultado.idSiembra || siembra._id;
    const especies = (resultado.especies || []).filter(
      (especie) => especie.severidad === 'alta',
    );

    for (const especie of especies) {
      const nombre = especie.nombre || 'maleza';
      await this.alertasService.registrarEventoSiembra({
        idSiembra,
        descripcion: 'Riesgo de Malezas',
        titulo: nombre,
        tipo: 'maleza',
        categoria: 'malezas',
        motor: 'prediccion-malezas',
        versionMotor: 'v1',
        lectura: `${nombre}: emergencia proyectada ${Number(especie.emergenciaProyectada7dPct || 0).toFixed(1)}%.`,
        recomendacion: especie.recomendacion,
        calidadDatos: {
          nivel: 'media',
          fuente: 'Acumulacion termica/hidrica y parametros de especie',
          detalle:
            'Proyeccion diaria del motor de malezas; debe cruzarse con recorrida y cobertura real.',
        },
        fecha,
        eventKey: `maleza:${idSiembra}:${this.slug(
          especie.codigoCarga || nombre,
        )}:${this.dateKey(fecha)}`,
        reporte: {
          tipo: 'maleza',
          idMaleza: especie.idMaleza,
          maleza: nombre,
          avancePct: especie.avancePct,
          emergenciaPct: especie.emergenciaProyectada7dPct,
          severidad: especie.severidad,
          recomendacion: especie.recomendacion,
        },
        tenant: {
          idDistribuidor: siembra.idDistribuidor,
          idEstablecimiento: siembra.idEstablecimiento,
          idProductor: siembra.idProductor,
          idQuimica: siembra.idQuimica,
        },
      });
    }
  }

  private dateKey(fecha = new Date().toISOString()): string {
    const date = new Date(fecha);
    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private slug(value?: string): string {
    return (
      value
        ?.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'evento'
    );
  }
}
