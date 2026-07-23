import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CLIMA_SYNC_ENABLED, CLIMA_SYNC_INTERVAL_MS } from '../../env';
import { EstablecimientosService } from './service';

@Injectable()
export class EstablecimientosClimateSyncService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(EstablecimientosClimateSyncService.name);
  private interval?: NodeJS.Timeout;
  private running = false;

  constructor(private establecimientosService: EstablecimientosService) {}

  onModuleInit() {
    if (!CLIMA_SYNC_ENABLED) {
      this.logger.log('Sincronizacion climatica desactivada');
      return;
    }

    this.logger.log(
      `Sincronizacion climatica activa cada ${Math.round(CLIMA_SYNC_INTERVAL_MS / 60000)} minutos`,
    );
    setTimeout(() => this.run('startup'), 30_000);
    this.interval = setInterval(
      () => this.run('interval'),
      CLIMA_SYNC_INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async run(reason: 'startup' | 'interval') {
    if (this.running) {
      this.logger.warn('Sincronizacion climatica omitida: corrida en curso');
      return;
    }

    this.running = true;
    try {
      const result =
        await this.establecimientosService.refreshClimaDeEstablecimientos();
      this.logger.log(
        `Clima actualizado (${reason}): ${result.actualizados}/${result.total} establecimientos, errores ${result.errores}`,
      );
    } catch (error) {
      this.logger.error('Error general sincronizando clima', error as any);
    } finally {
      this.running = false;
    }
  }
}
