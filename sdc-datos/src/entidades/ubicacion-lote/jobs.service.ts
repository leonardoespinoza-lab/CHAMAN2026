import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  GEOREF_BACKFILL_LIMIT,
  GEOREF_SYNC_CRON,
  GEOREF_SYNC_ENABLED,
  GEOREF_SYNC_STARTUP_DELAY_MS,
} from '../../env';
import { GeorefCatalogSyncService } from './georef-sync.service';
import { LotLocationService } from './service';
import { EstablishmentLocationService } from './establishment-location.service';

@Injectable()
export class LotLocationJobsService implements OnModuleInit {
  private readonly logger = new Logger(LotLocationJobsService.name);
  private running?: Promise<unknown>;

  constructor(
    private readonly syncService: GeorefCatalogSyncService,
    private readonly locationService: LotLocationService,
    private readonly establishmentLocationService: EstablishmentLocationService,
  ) {}

  onModuleInit(): void {
    if (!GEOREF_SYNC_ENABLED) return;
    setTimeout(
      () => void this.run(false, 'backfill'),
      GEOREF_SYNC_STARTUP_DELAY_MS,
    );
  }

  @Cron(GEOREF_SYNC_CRON, { timeZone: 'America/Argentina/Buenos_Aires' })
  scheduledSync(): void {
    if (!GEOREF_SYNC_ENABLED) return;
    void this.run(false, 'source_version_changed');
  }

  run(
    force: boolean,
    reason: 'backfill' | 'source_version_changed',
  ): Promise<unknown> {
    if (this.running) return this.running;
    this.running = this.execute(force, reason).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async execute(
    force: boolean,
    reason: 'backfill' | 'source_version_changed',
  ) {
    try {
      const sync = await this.syncService.sync(force);
      const backfill = await this.locationService.backfill(
        sync.activated ? 'source_version_changed' : reason,
        GEOREF_BACKFILL_LIMIT,
      );
      const establishmentBackfill =
        await this.establishmentLocationService.backfill(
          sync.activated ? 'source_version_changed' : reason,
          GEOREF_BACKFILL_LIMIT,
        );
      this.logger.log(
        `GeoRef ${sync.snapshotId}; lotes ${JSON.stringify(backfill)}; establecimientos ${JSON.stringify(establishmentBackfill)}.`,
      );
      return { sync, backfill, establishmentBackfill };
    } catch (error) {
      this.logger.error(`Job de ubicacion fallo: ${error?.message || error}`);
      throw error;
    }
  }
}
