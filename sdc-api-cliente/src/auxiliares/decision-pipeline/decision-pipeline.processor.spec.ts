import { DecisionPipelineProcessor } from './decision-pipeline.processor';
import {
  DecisionEventV1,
  DecisionScopeJobData,
  DecisionSowingJobData,
} from './decision-pipeline.types';

describe('DecisionPipelineProcessor', () => {
  const event: DecisionEventV1 = {
    schemaVersion: 1,
    eventId: 'event-1',
    idempotencyKey: 'hash-1',
    trigger: 'siembra.updated',
    aggregate: { type: 'siembra', id: 'siembra-1' },
    changedFields: ['fechaSiembra'],
    impact: {
      sincronizarClima: true,
      reconstruirSanidad: true,
      evaluarAgroclima: true,
    },
    occurredAt: '2026-07-16T00:00:00.000Z',
  };

  function setup() {
    const order: string[] = [];
    const repository = {
      resolveActiveSowingIds: jest.fn().mockResolvedValue([]),
      getActiveSowing: jest.fn().mockResolvedValue({
        _id: 'siembra-1',
        fechaSiembra: '2026-05-05T00:00:00.000Z',
      }),
      reprocessClimate: jest.fn(async () => {
        order.push('clima');
      }),
      rebuildSanitaryPredictions: jest.fn(async () => {
        order.push('sanidad');
      }),
      evaluateAgroclimate: jest.fn(async () => {
        order.push('agroclima');
      }),
    };
    const queueService = {
      enqueueResolvedSowing: jest.fn().mockResolvedValue({ id: 'child' }),
    };
    const queue = {
      client: {
        set: jest.fn().mockResolvedValue('OK'),
        eval: jest.fn().mockResolvedValue(1),
      },
    };
    const processor = new DecisionPipelineProcessor(
      repository as any,
      queueService as any,
      queue as any,
    );
    return { processor, repository, queueService, queue, order };
  }

  function sowingJob(): any {
    return {
      id: 'job-1',
      attemptsMade: 0,
      data: { event, idSiembra: 'siembra-1' } as DecisionSowingJobData,
      progress: jest.fn().mockResolvedValue(undefined),
    };
  }

  it('ejecuta estrictamente clima, sanidad y agroclima', async () => {
    const { processor, repository, queue, order } = setup();

    await processor.recomputeSowing(sowingJob());

    expect(order).toEqual(['clima', 'sanidad', 'agroclima']);
    expect(repository.reprocessClimate).toHaveBeenCalledWith('siembra-1', true);
    expect(queue.client.eval).toHaveBeenCalledTimes(1);
  });

  it('propaga la falla climatica para que Bull reintente y no ejecuta etapas posteriores', async () => {
    const { processor, repository, queue } = setup();
    repository.reprocessClimate.mockRejectedValueOnce(
      new Error('clima no disponible'),
    );

    await expect(processor.recomputeSowing(sowingJob())).rejects.toThrow(
      'clima no disponible',
    );

    expect(repository.rebuildSanitaryPredictions).not.toHaveBeenCalled();
    expect(repository.evaluateAgroclimate).not.toHaveBeenCalled();
    expect(queue.client.eval).toHaveBeenCalledTimes(1);
  });

  it('no procesa dos decisiones simultaneas de la misma siembra', async () => {
    const { processor, repository, queue } = setup();
    queue.client.set.mockResolvedValueOnce(null);

    await expect(processor.recomputeSowing(sowingJob())).rejects.toThrow(
      'ya tiene una decision en proceso',
    );

    expect(repository.getActiveSowing).not.toHaveBeenCalled();
    expect(queue.client.eval).not.toHaveBeenCalled();
  });

  it('expande un alcance y crea un trabajo durable por cada siembra', async () => {
    const { processor, repository, queueService } = setup();
    repository.resolveActiveSowingIds.mockResolvedValueOnce([
      'siembra-1',
      'siembra-2',
    ]);
    const job = {
      id: 'scope-1',
      data: {
        event: {
          ...event,
          aggregate: { type: 'semilla', id: 'semilla-1' },
        },
        scope: { type: 'semilla', id: 'semilla-1' },
      } as DecisionScopeJobData,
    } as any;

    await expect(processor.expandScope(job)).resolves.toEqual({
      sowings: 2,
      ids: ['siembra-1', 'siembra-2'],
    });
    expect(queueService.enqueueResolvedSowing).toHaveBeenNthCalledWith(
      1,
      job.data.event,
      'siembra-1',
    );
    expect(queueService.enqueueResolvedSowing).toHaveBeenNthCalledWith(
      2,
      job.data.event,
      'siembra-2',
    );
  });
});
