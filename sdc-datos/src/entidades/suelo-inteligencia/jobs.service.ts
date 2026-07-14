import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  SOIL_INTELLIGENCE_CRON,
  SOIL_INTELLIGENCE_ENABLED,
  SOIL_INTELLIGENCE_RECOVERY_LIMIT,
  SOIL_INTELLIGENCE_STARTUP_BACKFILL_LIMIT,
  SOIL_INTELLIGENCE_STARTUP_DELAY_MS,
} from '../../env';
import { LotSoilIntelligenceEngine } from './engine.service';
import { SoilIntelligenceRepository } from './repository';

@Injectable()
export class SoilIntelligenceJobsService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SoilIntelligenceJobsService.name);
  private startupTimer?: ReturnType<typeof setTimeout>;
  private running?: Promise<unknown>;

  constructor(
    private readonly engine: LotSoilIntelligenceEngine,
    private readonly repository: SoilIntelligenceRepository,
  ) {}

  onModuleInit(): void {
    if (!SOIL_INTELLIGENCE_ENABLED) return;
    this.startupTimer = setTimeout(() => {
      this.startupTimer = undefined;
      void this.recover().catch((error) =>
        this.logger.error(
          `Recuperación edáfica inicial falló: ${error?.message || error}`,
        ),
      );
      if (SOIL_INTELLIGENCE_STARTUP_BACKFILL_LIMIT > 0) {
        void this.backfill(SOIL_INTELLIGENCE_STARTUP_BACKFILL_LIMIT).catch(
          (error) =>
            this.logger.error(
              `Backfill edáfico inicial falló: ${error?.message || error}`,
            ),
        );
      }
    }, SOIL_INTELLIGENCE_STARTUP_DELAY_MS);
  }

  onModuleDestroy(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
  }

  @Cron(SOIL_INTELLIGENCE_CRON, {
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  scheduledRecovery(): void {
    if (!SOIL_INTELLIGENCE_ENABLED) return;
    void this.recover().catch(() => undefined);
  }

  backfill(limit = 0): Promise<unknown> {
    if (this.running) return this.running;
    this.running = this.engine.backfill(limit).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  async recover(): Promise<{ attempted: number; completed: number }> {
    const pending = await this.repository.claimPending(
      SOIL_INTELLIGENCE_RECOVERY_LIMIT,
    );
    let completed = 0;
    for (const assessment of pending) {
      if ((assessment.attempts || 0) >= 4) continue;
      try {
        await this.engine.request(
          assessment.loteId,
          assessment.status === 'partial' ? 'partial_retry' : 'failed_retry',
          { immediate: true, force: true },
        );
        completed++;
      } catch {
        // El motor persiste el estado failed y el siguiente cron aplica backoff operativo.
      }
    }
    return { attempted: pending.length, completed };
  }
}
