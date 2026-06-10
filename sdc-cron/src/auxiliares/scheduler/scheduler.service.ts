import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ITareaNDVI } from '../cron/cron.service';
import { TZDate } from '@date-fns/tz';

@Injectable()
export class SchedulerService {
  private logger = new Logger(SchedulerService.name);
  constructor(@InjectQueue('tareas-ndvi') private tareasNdviQueue: Queue) {}

  public async tareasNDVI(data: ITareaNDVI) {
    this.logger.debug(`Recibido tarea NDVI`);
    const hoyArg = new TZDate(new Date(), 'America/Argentina/Buenos_Aires');
    const treitaSegundos = 30 * 1000; // 30 segundos
    const delay = hoyArg.getTime() + treitaSegundos;
    this.logger.debug(
      `Tarea nueva de ${data.lote_id} en ${this.msToHHMMSS(delay)}`,
    );
    await this.tareasNdviQueue.add(data.lote_id, data, {
      delay,
      jobId: data.lote_id,
    });
    const total = await this.tareasNdviQueue.getJobCounts(
      'delayed',
      'completed',
      'failed',
    );
    // Returns an object like this { delayed: number, completed: number, failed: number }
    this.logger.debug(`Total de tareas pendientes: ${total.delayed}`);
    this.logger.debug(`Total de tareas completadas: ${total.completed}`);
    this.logger.debug(`Total de tareas falladas: ${total.failed}`);
  }

  public async clearQueues() {
    try {
      await Promise.all([
        this.tareasNdviQueue.clean(0, 0, 'completed'),
        this.tareasNdviQueue.clean(0, 0, 'failed'),
      ]);
    } catch (error) {
      this.logger.error(error);
      console.log(error);
    }
  }

  private msToHHMMSS(ms: number): string {
    const hh = Math.floor(ms / 1000 / 60 / 60);
    const mm = Math.floor((ms / 1000 / 60 / 60 - hh) * 60);
    const ss = Math.floor(((ms / 1000 / 60 / 60 - hh) * 60 - mm) * 60);
    return `${hh}:${mm}:${ss}`;
  }
}
