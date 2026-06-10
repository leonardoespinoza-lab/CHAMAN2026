import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, CronOptions } from '@nestjs/schedule';
import { TZDate } from '@date-fns/tz';
import { SchedulerService } from '../scheduler/scheduler.service';
import { REDIS_NAMESPACE, TAREAS_TEST } from 'src/env';
import { LotesService } from 'src/entidades/lotes/service';
import { ReporteNDVIsService } from 'src/entidades/reporte-ndvis/service';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { IFilter, ILote, IQueryParam, IReporteNDVI } from 'modelos/src';
// Ejemplo de tarea
const x = {
  lote_id: '6773ee7135a7c52be2fbc141',
  scene_datetime: '2024-11-01T14:25:00Z',
  polygon: [
    [-62.850831956712874, -32.84550133045925],
    [-62.84876771287731, -32.83700844153577],
    [-62.83683082717503, -32.83916414384563],
    [-62.83697126072519, -32.8395386333126],
    [-62.837392561375545, -32.841153619138964],
    [-62.83927219123371, -32.84839127182904],
    [-62.845170030763896, -32.847211703923],
    [-62.84570083632161, -32.84998368850219],
    [-62.84682142583235, -32.84980675331628],
    [-62.84870873448201, -32.845973157621664],
    [-62.850831956712874, -32.84550133045925],
  ],
};

export interface ITareaNDVI {
  lote_id: string; // ID del lote
  scene_datetime: string | null; // Fecha de la última escena
  polygon: [[number, number][]]; // Coordenadas del polígono
}

const CRON_OPTIONS: CronOptions = {
  // timeZone: 'America/Argentina/Buenos_Aires',
  utcOffset: -3,
};

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly redis: RedisService,
    private scheduler: SchedulerService,
    private lotes: LotesService,
    private reportes: ReporteNDVIsService,
  ) {
    this.logger.verbose('CronService iniciado');
    this.logger.verbose(`TAREAS_TEST: ${TAREAS_TEST ? '👍' : '👎'}`);
    // this.prueba();
  }

  private async prueba() {
    await this.wait(5000); // Espera 5 segundo
    this.logger.debug('Prueba de cron');
    this.enqueueTask('tareas-ndvi', JSON.stringify(x));
  }

  private wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, CRON_OPTIONS)
  async clearQueues() {
    this.logger.debug('Limpiando queues');
    await this.scheduler.clearQueues();
  }

  @Cron(
    `${
      TAREAS_TEST
        ? CronExpression.EVERY_5_MINUTES
        : CronExpression.EVERY_DAY_AT_MIDNIGHT
    }`,
    CRON_OPTIONS,
  )
  async GenerarTareasNDVI() {
    this.logger.debug(
      'Generando Tareas',
      `TAREAS_TEST: ${TAREAS_TEST ? '👍' : '👎'}`,
    );
    // Traigo todos los lotes
    this.logger.debug('Generando tareas NDVI');
    const filter: IFilter<any> = {
      'ubicacion.geojson': {
        $exists: true,
      },
    };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      limit: 0,
    };
    const listado = await this.lotes.getFiltered(query);
    const lotes: ILote[] = listado.datos;
    const total: number = listado.totalCount;
    this.logger.debug(
      'Lotes con polígono: ' + lotes.length + 'de ' + total + ' totales',
    );
    const reportes = (await this.reportes.getLast()).datos;

    // (OPTIMIZACIÓN) Convertir el array en un Mapa para búsquedas instantáneas. // Magia de GEMINI
    // La clave será el id del lote y el valor será el objeto reporte completo.
    const mapaReportes = new Map<string, IReporteNDVI>(
      reportes.map((reporte) => [reporte.idLote.toString(), reporte]),
    );
    this.logger.debug('Reportes encontrados: ' + reportes.length);
    for (const l of lotes) {
      try {
        const polygon = l.ubicacion?.geojson?.coordinates;
        if (!polygon) {
          this.logger.warn(
            `Lote ${l._id} no tiene polígono definido, no se generará tarea`,
          );
          continue;
        }
        // Búsqueda instantánea en el Mapa. Mucho más rápido que find().
        const reporte = mapaReportes.get(l._id.toString());

        const tarea: ITareaNDVI = {
          lote_id: l._id,
          polygon,
          scene_datetime: reporte ? reporte.fechaDeLaImagen : null,
        };
        // Escribo la tarea en Redis
        await this.enqueueTask('tareas-ndvi', JSON.stringify(tarea));
      } catch (error) {
        this.logger.error(
          `Error al generar tarea para el lote ${l._id}: ${error}`,
        );
      }
    }
    this.logger.debug('Tareas generadas');
    const queueLength = await this.getQueueLength('tareas-ndvi');
    this.logger.debug(`📦 Total de tareas en cola: ${queueLength}`);
  }

  /// REDIS
  private async setKey(key: string, value: string) {
    return await this.redis.getOrThrow(REDIS_NAMESPACE).set(key, value);
  }

  // REDIS
  private async enqueueTask(queue: string, payload: string) {
    return await this.redis.getOrThrow(REDIS_NAMESPACE).lpush(queue, payload);
  }

  private async getQueueLength(queue: string): Promise<number> {
    return await this.redis.getOrThrow(REDIS_NAMESPACE).llen(queue);
  }

  private async getKey(key: string) {
    return await this.redis.getOrThrow(REDIS_NAMESPACE).get(key);
  }
  private async delKey(key: string) {
    return await this.redis.getOrThrow(REDIS_NAMESPACE).del(key);
  }

  ///

  private dateToYYYYMMDD(date: TZDate): string {
    return (
      date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate()
    );
  }
}
