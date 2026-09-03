import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { Job, Queue } from 'bull';
import {
  DECISION_HISTORICAL_JOB_OPTIONS,
  DECISION_JOB_OPTIONS,
  DECISION_PIPELINE_QUEUE,
  EXPAND_DECISION_SCOPE_JOB,
  RECOMPUTE_SOWING_JOB,
} from './decision-pipeline.constants';
import {
  DecisionAggregateType,
  DecisionEnqueueOptions,
  DecisionEventV1,
  DecisionScopeJobData,
  DecisionSowingJobData,
} from './decision-pipeline.types';
import { DecisionPipelineRepository } from './decision-pipeline.repository';

@Injectable()
export class DecisionPipelineQueueService {
  private readonly logger = new Logger(DecisionPipelineQueueService.name);

  constructor(
    @InjectQueue(DECISION_PIPELINE_QUEUE)
    private readonly queue: Queue,
    private readonly repository: DecisionPipelineRepository,
  ) {}

  async enqueueForSowing(
    idSiembra: string,
    options: DecisionEnqueueOptions,
  ): Promise<Job<DecisionSowingJobData> | undefined> {
    const event = this.createEvent('siembra', idSiembra, options);
    return await this.enqueueResolvedSowing(event, idSiembra);
  }

  async enqueueForSeed(
    idSemilla: string,
    options: DecisionEnqueueOptions,
  ): Promise<Job<DecisionScopeJobData> | undefined> {
    return await this.enqueueScope('semilla', idSemilla, options);
  }

  async enqueueForLot(
    idLote: string,
    options: DecisionEnqueueOptions,
  ): Promise<Job<DecisionScopeJobData> | undefined> {
    return await this.enqueueScope('lote', idLote, options);
  }

  async enqueueForEstablishment(
    idEstablecimiento: string,
    options: DecisionEnqueueOptions,
  ): Promise<Job<DecisionScopeJobData> | undefined> {
    return await this.enqueueScope(
      'establecimiento',
      idEstablecimiento,
      options,
    );
  }

  async enqueueResolvedSowing(
    event: DecisionEventV1,
    idSiembra: string,
  ): Promise<Job<DecisionSowingJobData> | undefined> {
    const normalizedId = this.requiredId(idSiembra, 'siembra');
    const data: DecisionSowingJobData = { event, idSiembra: normalizedId };
    const jobId = `decision-sowing-${normalizedId}-${event.idempotencyKey}`;
    try {
      const job = await this.queue.add(RECOMPUTE_SOWING_JOB, data, {
        ...(event.impact.forceClimateBackfill
          ? DECISION_HISTORICAL_JOB_OPTIONS
          : DECISION_JOB_OPTIONS),
        jobId,
        priority: 1,
      });
      this.logger.log(
        JSON.stringify({
          event: 'decision_job_enqueued',
          jobId: job.id,
          idSiembra: normalizedId,
          trigger: event.trigger,
        }),
      );
      return job;
    } catch (error) {
      this.logger.error(
        `Redis no acepto la decision ${jobId}; se ejecutara el fallback sincronico: ${error?.message || error}`,
      );
      await this.runSowingSynchronously(event, normalizedId);
      return undefined;
    }
  }

  private async enqueueScope(
    aggregateType: Exclude<DecisionAggregateType, 'siembra'>,
    aggregateId: string,
    options: DecisionEnqueueOptions,
  ): Promise<Job<DecisionScopeJobData> | undefined> {
    const normalizedId = this.requiredId(aggregateId, aggregateType);
    const event = this.createEvent(aggregateType, normalizedId, options);
    const data: DecisionScopeJobData = {
      event,
      scope: { type: aggregateType, id: normalizedId },
    };
    try {
      return await this.queue.add(EXPAND_DECISION_SCOPE_JOB, data, {
        ...DECISION_JOB_OPTIONS,
        jobId: `decision-scope-${event.idempotencyKey}`,
        priority: 2,
      });
    } catch (error) {
      this.logger.error(
        `Redis no acepto el alcance ${aggregateType}/${normalizedId}; se ejecutara el fallback sincronico: ${error?.message || error}`,
      );
      const sowingIds = await this.repository.resolveActiveSowingIds(
        aggregateType,
        normalizedId,
      );
      const failures: Error[] = [];
      for (const idSiembra of sowingIds) {
        try {
          await this.runSowingSynchronously(event, idSiembra);
        } catch (fallbackError) {
          failures.push(
            fallbackError instanceof Error
              ? fallbackError
              : new Error(String(fallbackError)),
          );
        }
      }
      if (failures.length) {
        const failure = new Error(
          `Fallaron ${failures.length} recalculos sincronos de ${sowingIds.length}.`,
        ) as Error & { causes?: Error[] };
        failure.causes = failures;
        throw failure;
      }
      return undefined;
    }
  }

  private async runSowingSynchronously(
    event: DecisionEventV1,
    idSiembra: string,
  ): Promise<void> {
    const sowing = await this.repository.getActiveSowing(idSiembra);
    if (!sowing) return;
    await this.repository.reprocessClimate(
      idSiembra,
      event.impact.sincronizarClima,
      event.impact.forceClimateBackfill,
    );
    await this.repository.rebuildSanitaryPredictions(idSiembra);
    await this.repository.evaluateAgroclimate(idSiembra);
  }

  private createEvent(
    aggregateType: DecisionAggregateType,
    aggregateId: string,
    options: DecisionEnqueueOptions,
  ): DecisionEventV1 {
    const normalizedId = this.requiredId(aggregateId, aggregateType);
    const eventId = String(options.operationId || randomUUID());
    const changedFields = [
      ...new Set((options.changedFields || []).map(String).filter(Boolean)),
    ].sort();
    const canonical = JSON.stringify({
      schemaVersion: 1,
      eventId,
      trigger: options.trigger,
      aggregateType,
      aggregateId: normalizedId,
      changedFields,
      sincronizarClima: Boolean(options.sincronizarClima),
      forceClimateBackfill: Boolean(options.forceClimateBackfill),
    });
    const idempotencyKey = createHash('sha256').update(canonical).digest('hex');
    return {
      schemaVersion: 1,
      eventId,
      idempotencyKey,
      trigger: options.trigger,
      aggregate: { type: aggregateType, id: normalizedId },
      changedFields,
      impact: {
        sincronizarClima: Boolean(options.sincronizarClima),
        forceClimateBackfill: Boolean(options.forceClimateBackfill),
        reconstruirSanidad: true,
        evaluarAgroclima: true,
      },
      occurredAt: new Date().toISOString(),
    };
  }

  private requiredId(value: string, aggregate: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) {
      throw new Error(`No se puede encolar ${aggregate} sin identificador.`);
    }
    return normalized;
  }
}
