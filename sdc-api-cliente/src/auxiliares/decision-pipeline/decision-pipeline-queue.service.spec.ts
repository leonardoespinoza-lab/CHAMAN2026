import {
  DECISION_HISTORICAL_JOB_OPTIONS,
  DECISION_JOB_OPTIONS,
  EXPAND_DECISION_SCOPE_JOB,
  RECOMPUTE_SOWING_JOB,
} from './decision-pipeline.constants';
import { DecisionPipelineQueueService } from './decision-pipeline-queue.service';

describe('DecisionPipelineQueueService', () => {
  function setup() {
    const queue = {
      add: jest.fn(async (_name, _data, options) => ({
        id: options.jobId,
      })),
    };
    const repository = {
      resolveActiveSowingIds: jest.fn().mockResolvedValue(['siembra-1']),
      getActiveSowing: jest.fn().mockResolvedValue({
        _id: 'siembra-1',
        fechaSiembra: '2026-05-05T00:00:00.000Z',
      }),
      reprocessClimate: jest.fn().mockResolvedValue(undefined),
      rebuildSanitaryPredictions: jest.fn().mockResolvedValue([]),
      evaluateAgroclimate: jest.fn().mockResolvedValue({}),
    };
    return {
      queue,
      repository,
      service: new DecisionPipelineQueueService(
        queue as any,
        repository as any,
      ),
    };
  }

  it('encola una siembra con retries, backoff y un id estable por operacion', async () => {
    const { queue, service } = setup();

    await service.enqueueForSowing('siembra-1', {
      trigger: 'siembra.updated',
      changedFields: ['fechaSiembra', 'idSemilla', 'fechaSiembra'],
      sincronizarClima: true,
      operationId: 'operacion-1',
    });

    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, data, options] = queue.add.mock.calls[0];
    expect(name).toBe(RECOMPUTE_SOWING_JOB);
    expect(data).toMatchObject({
      idSiembra: 'siembra-1',
      event: {
        eventId: 'operacion-1',
        changedFields: ['fechaSiembra', 'idSemilla'],
        impact: {
          sincronizarClima: true,
          forceClimateBackfill: false,
        },
      },
    });
    expect(options).toMatchObject({
      attempts: DECISION_JOB_OPTIONS.attempts,
      backoff: DECISION_JOB_OPTIONS.backoff,
      timeout: DECISION_JOB_OPTIONS.timeout,
      priority: 1,
      jobId: expect.stringMatching(/^decision-sowing-siembra-1-/),
    });
  });

  it('mantiene pendientes los backfills historicos con reintentos espaciados', async () => {
    const { queue, service } = setup();

    await service.enqueueForSowing('siembra-1', {
      trigger: 'siembra.updated',
      changedFields: ['fechaSiembra'],
      sincronizarClima: true,
      forceClimateBackfill: true,
      operationId: 'backfill-1',
    });

    const [, data, options] = queue.add.mock.calls[0];
    expect(data.event.impact.forceClimateBackfill).toBe(true);
    expect(options).toMatchObject({
      attempts: DECISION_HISTORICAL_JOB_OPTIONS.attempts,
      backoff: DECISION_HISTORICAL_JOB_OPTIONS.backoff,
    });
  });

  it.each([
    ['semilla', 'semilla-1', 'enqueueForSeed'],
    ['lote', 'lote-1', 'enqueueForLot'],
    ['establecimiento', 'establecimiento-1', 'enqueueForEstablishment'],
  ] as const)(
    'encola expansion durable para el alcance %s',
    async (scopeType, scopeId, method) => {
      const { queue, service } = setup();

      await service[method](scopeId, {
        trigger:
          scopeType === 'semilla'
            ? 'semilla.science-updated'
            : scopeType === 'lote'
              ? 'lote.science-updated'
              : 'establecimiento.weather-source-updated',
        changedFields: ['ubicacion'],
        sincronizarClima: scopeType !== 'semilla',
        operationId: `op-${scopeType}`,
      });

      expect(queue.add).toHaveBeenCalledWith(
        EXPAND_DECISION_SCOPE_JOB,
        expect.objectContaining({
          scope: { type: scopeType, id: scopeId },
        }),
        expect.objectContaining({
          attempts: 8,
          priority: 2,
          jobId: expect.stringMatching(/^decision-scope-/),
        }),
      );
    },
  );

  it('rechaza identificadores vacios antes de escribir en Redis', async () => {
    const { queue, service } = setup();

    await expect(
      service.enqueueForSowing('', {
        trigger: 'siembra.updated',
        sincronizarClima: true,
      }),
    ).rejects.toThrow('sin identificador');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('si Redis cae completa sincronicamente las tres etapas y no pierde la mutacion', async () => {
    const { queue, repository, service } = setup();
    const order: string[] = [];
    queue.add.mockRejectedValueOnce(new Error('Redis caido'));
    repository.reprocessClimate.mockImplementationOnce(async () => {
      order.push('clima');
    });
    repository.rebuildSanitaryPredictions.mockImplementationOnce(async () => {
      order.push('sanidad');
    });
    repository.evaluateAgroclimate.mockImplementationOnce(async () => {
      order.push('agroclima');
    });

    await expect(
      service.enqueueForSowing('siembra-1', {
        trigger: 'siembra.updated',
        sincronizarClima: true,
        operationId: 'fallback-1',
      }),
    ).resolves.toBeUndefined();

    expect(order).toEqual(['clima', 'sanidad', 'agroclima']);
  });

  it('si Redis cae al expandir una semilla recupera todas sus siembras', async () => {
    const { queue, repository, service } = setup();
    queue.add.mockRejectedValueOnce(new Error('Redis caido'));
    repository.resolveActiveSowingIds.mockResolvedValueOnce([
      'siembra-1',
      'siembra-2',
    ]);
    repository.getActiveSowing.mockImplementation(async (id) => ({
      _id: id,
      fechaSiembra: '2026-05-05T00:00:00.000Z',
    }));

    await expect(
      service.enqueueForSeed('semilla-1', {
        trigger: 'semilla.science-updated',
        sincronizarClima: false,
      }),
    ).resolves.toBeUndefined();

    expect(repository.reprocessClimate).toHaveBeenCalledTimes(2);
    expect(repository.rebuildSanitaryPredictions).toHaveBeenCalledTimes(2);
    expect(repository.evaluateAgroclimate).toHaveBeenCalledTimes(2);
  });
});
