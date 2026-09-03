import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Job, Queue } from 'bull';
import {
  DECISION_LOCK_TTL_MS,
  DECISION_PIPELINE_QUEUE,
  DECISION_WORKER_CONCURRENCY,
  EXPAND_DECISION_SCOPE_JOB,
  RECOMPUTE_SOWING_JOB,
} from './decision-pipeline.constants';
import { DecisionPipelineQueueService } from './decision-pipeline-queue.service';
import { DecisionPipelineRepository } from './decision-pipeline.repository';
import {
  DecisionScopeJobData,
  DecisionSowingJobData,
} from './decision-pipeline.types';
import { REDIS_KEY_PREFIX } from '../../env';

@Processor(DECISION_PIPELINE_QUEUE)
export class DecisionPipelineProcessor {
  private readonly logger = new Logger(DecisionPipelineProcessor.name);

  constructor(
    private readonly repository: DecisionPipelineRepository,
    private readonly queueService: DecisionPipelineQueueService,
    @InjectQueue(DECISION_PIPELINE_QUEUE)
    private readonly queue: Queue,
  ) {}

  @Process(EXPAND_DECISION_SCOPE_JOB)
  async expandScope(job: Job<DecisionScopeJobData>) {
    const { event, scope } = job.data;
    const ids = await this.repository.resolveActiveSowingIds(
      scope.type,
      scope.id,
    );
    for (const idSiembra of ids) {
      await this.queueService.enqueueResolvedSowing(event, idSiembra);
    }
    this.logger.log(
      JSON.stringify({
        event: 'decision_scope_expanded',
        jobId: job.id,
        scope,
        sowings: ids.length,
      }),
    );
    return { sowings: ids.length, ids };
  }

  @Process({
    name: RECOMPUTE_SOWING_JOB,
    concurrency: DECISION_WORKER_CONCURRENCY,
  })
  async recomputeSowing(job: Job<DecisionSowingJobData>) {
    const { event, idSiembra } = job.data;
    const completedStages = { ...(job.data.completedStages || {}) };
    const lockKey = `${REDIS_KEY_PREFIX}:decision-lock:${idSiembra}`;
    const token = randomUUID();
    const acquired = await this.queue.client.set(
      lockKey,
      token,
      'PX',
      DECISION_LOCK_TTL_MS,
      'NX',
    );
    if (acquired !== 'OK') {
      throw new Error(
        `La siembra ${idSiembra} ya tiene una decision en proceso.`,
      );
    }

    const startedAt = Date.now();
    try {
      const sowing = await this.repository.getActiveSowing(idSiembra);
      if (!sowing) {
        this.logger.warn(
          JSON.stringify({
            event: 'decision_sowing_skipped',
            jobId: job.id,
            idSiembra,
            reason: 'inactive-or-missing',
          }),
        );
        return { skipped: true, reason: 'inactive-or-missing' };
      }

      await job.progress(completedStages.clima ? 45 : 10);
      if (!completedStages.clima) {
        await this.repository.reprocessClimate(
          idSiembra,
          event.impact.sincronizarClima,
          event.impact.forceClimateBackfill,
        );
        completedStages.clima = new Date().toISOString();
        await job.update({ ...job.data, completedStages });
      }
      await job.progress(45);
      if (!completedStages.sanidad) {
        await this.repository.rebuildSanitaryPredictions(idSiembra);
        completedStages.sanidad = new Date().toISOString();
        await job.update({ ...job.data, completedStages });
      }
      await job.progress(80);
      if (!completedStages.agroclima) {
        await this.repository.evaluateAgroclimate(idSiembra);
        completedStages.agroclima = new Date().toISOString();
        await job.update({ ...job.data, completedStages });
      }
      await job.progress(100);

      const result = {
        skipped: false,
        idSiembra,
        durationMs: Date.now() - startedAt,
      };
      this.logger.log(
        JSON.stringify({
          event: 'decision_pipeline_completed',
          jobId: job.id,
          trigger: event.trigger,
          ...result,
        }),
      );
      return result;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'decision_pipeline_failed',
          jobId: job.id,
          idSiembra,
          trigger: event.trigger,
          attempt: job.attemptsMade + 1,
          durationMs: Date.now() - startedAt,
          error: error?.message || String(error),
        }),
      );
      throw error;
    } finally {
      await this.releaseLock(lockKey, token);
    }
  }

  private async releaseLock(key: string, token: string): Promise<void> {
    try {
      await this.queue.client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        key,
        token,
      );
    } catch (error) {
      this.logger.error(
        `No se pudo liberar el lock de decision ${key}: ${error?.message || error}`,
      );
    }
  }
}
