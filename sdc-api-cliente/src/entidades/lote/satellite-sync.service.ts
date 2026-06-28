import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  NDVI_SYNC_ENABLED,
  NDVI_SYNC_INTERVAL_MS,
  NDVI_SYNC_STARTUP_DELAY_MS,
} from '../../env';
import { LotesService } from './service';

@Injectable()
export class SatelliteSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SatelliteSyncService.name);
  private interval?: NodeJS.Timeout;
  private running = false;

  constructor(private lotesService: LotesService) {}

  onModuleInit() {
    if (!NDVI_SYNC_ENABLED) {
      this.logger.log('Sincronizacion satelital desactivada');
      return;
    }

    this.logger.log(
      `Sincronizacion satelital activa cada ${Math.round(
        NDVI_SYNC_INTERVAL_MS / 3600000,
      )} horas`,
    );
    setTimeout(() => this.run('startup'), NDVI_SYNC_STARTUP_DELAY_MS);
    this.interval = setInterval(
      () => this.run('interval'),
      NDVI_SYNC_INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async run(reason: 'startup' | 'interval') {
    if (this.running) {
      this.logger.warn('Sincronizacion satelital omitida: corrida en curso');
      return;
    }

    this.running = true;
    try {
      const result = await this.lotesService.sincronizarNdviAutomatico();
      this.logger.log(
        `Satelite consultado (${reason}): ${result.encolados}/${result.total} tareas encoladas, ${result.omitidos} omitidas. Legacy v3: ${result.legacy.encolados}/${result.legacy.total}; normal: ${result.normal.encolados}/${result.normal.total}`,
      );
    } catch (error) {
      this.logger.error('Error general sincronizando satelite', error as any);
    } finally {
      this.running = false;
    }
  }
}
