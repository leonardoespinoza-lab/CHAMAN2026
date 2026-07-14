import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AGROMETEO_CRON_ENABLED } from '../../env';
import { AgrometeorologiaBatchService } from './batch.service';

@Injectable()
export class AgrometeorologiaCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AgrometeorologiaCronService.name);

  constructor(private batch: AgrometeorologiaBatchService) {}

  onApplicationBootstrap(): void {
    if (!AGROMETEO_CRON_ENABLED) return;
    const timer = setTimeout(() => {
      void this.run('startup');
    }, 60_000);
    timer.unref?.();
  }

  @Cron('17 * * * *', { timeZone: 'America/Argentina/Buenos_Aires' })
  async hourly(): Promise<void> {
    if (!AGROMETEO_CRON_ENABLED) return;
    await this.run('hourly');
  }

  private async run(trigger: string): Promise<void> {
    try {
      this.logger.log(`Motor agrometeorologico automatico (${trigger}).`);
      await this.batch.procesarActivas();
    } catch (error) {
      this.logger.error(`Fallo motor agrometeorologico (${trigger}): ${error}`);
    }
  }
}
