import {
  Processor,
  WorkerHost,
  OnWorkerEvent,
  InjectQueue,
} from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';

@Processor('tareas-ndvi')
export class NDVIProcessor extends WorkerHost {
  private logger = new Logger(NDVIProcessor.name);
  constructor(@InjectQueue('tareas-ndvi') private tareasNDVIQueue: Queue) {
    super();
  }
  async process(job: Job<any, void, string>): Promise<void> {
    this.logger.debug('Procesando cambio de recorrido');
    this.logger.debug('Despacho de la hora:' + job.data.fecha.toString());
    this.logger.debug(
      `Vehículo: ${job.data.idVehiculo} a recorrido ${job.data.idRecorrido}`,
    );
    const update: any = {
      'vehiculo.idRecorrido': job.data.idRecorrido,
      'vehiculo.idChofer': job.data.idChofer,
      'vehiculo.idsRecorridos': job.data.idsRecorridos,
    };
    // await this.service.update(job.data.idVehiculo, update);
  }

  @OnWorkerEvent('completed')
  async onCompleted() {
    // do some stuff
    this.logger.debug('Despachos job completed');
    const total = await this.tareasNDVIQueue.getJobCounts(
      'delayed',
      'completed',
      'failed',
    );
    // Returns an object like this { delayed: number, completed: number, failed: number }
    this.logger.debug(`Total de despachos pendientes: ${total.delayed}`);
    this.logger.debug(`Total de despachos completados: ${total.completed}`);
    this.logger.debug(`Total de despachos fallados: ${total.failed}`);
  }

  @OnWorkerEvent('failed')
  async onFailed() {
    // do some stuff
    this.logger.debug('Despachos job failed');
    const total = await this.tareasNDVIQueue.getJobCounts(
      'delayed',
      'completed',
      'failed',
    );
    // Returns an object like this { delayed: number, completed: number, failed: number }
    this.logger.debug(`Total de despachos pendientes: ${total.delayed}`);
    this.logger.debug(`Total de despachos completados: ${total.completed}`);
    this.logger.debug(`Total de despachos fallados: ${total.failed}`);
  }
}
