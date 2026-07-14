import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  GEOREF_BACKFILL_LIMIT,
  GEOREF_SYNC_CRON,
  GEOREF_SYNC_ENABLED,
  GEOREF_SYNC_STARTUP_MAX_ATTEMPTS,
  GEOREF_SYNC_STARTUP_DELAY_MS,
  GEOREF_SYNC_STARTUP_RETRY_MAX_MS,
  GEOREF_SYNC_STARTUP_RETRY_MS,
} from '../../env';
import { GeorefCatalogSyncService } from './georef-sync.service';
import { LotLocationService } from './service';
import { EstablishmentLocationService } from './establishment-location.service';

@Injectable()
export class LotLocationJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LotLocationJobsService.name);
  private running?: Promise<unknown>;
  private startupTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly syncService: GeorefCatalogSyncService,
    private readonly locationService: LotLocationService,
    private readonly establishmentLocationService: EstablishmentLocationService,
  ) {}

  onModuleInit(): void {
    if (!GEOREF_SYNC_ENABLED) return;
    this.scheduleStartupAttempt(GEOREF_SYNC_STARTUP_DELAY_MS, 0);
  }

  onModuleDestroy(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
  }

  @Cron(GEOREF_SYNC_CRON, { timeZone: 'America/Argentina/Buenos_Aires' })
  scheduledSync(): void {
    if (!GEOREF_SYNC_ENABLED) return;
    void this.run(false, 'source_version_changed').catch(() => undefined);
  }

  private scheduleStartupAttempt(delayMs: number, attemptIndex: number): void {
    this.startupTimer = setTimeout(() => {
      this.startupTimer = undefined;
      void this.run(false, 'backfill').catch((error) => {
        const attemptsUsed = attemptIndex + 1;
        if (attemptsUsed >= GEOREF_SYNC_STARTUP_MAX_ATTEMPTS) {
          this.logger.error(
            `GeoRef no pudo iniciar despues de ${attemptsUsed} intentos; se conserva el servicio activo y el cron reintentara.`,
          );
          return;
        }
        const retryDelay = Math.min(
          GEOREF_SYNC_STARTUP_RETRY_MS * 2 ** attemptIndex,
          GEOREF_SYNC_STARTUP_RETRY_MAX_MS,
        );
        this.logger.warn(
          `GeoRef inicial no disponible (${error?.message || error}); reintento ${attemptsUsed + 1}/${GEOREF_SYNC_STARTUP_MAX_ATTEMPTS} en ${retryDelay} ms.`,
        );
        this.scheduleStartupAttempt(retryDelay, attemptsUsed);
      });
    }, delayMs);
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
