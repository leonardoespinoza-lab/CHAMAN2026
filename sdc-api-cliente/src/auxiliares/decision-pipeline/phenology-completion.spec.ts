import { DecisionPipelineProcessor } from './decision-pipeline.processor';
import { DecisionPipelineQueueService } from './decision-pipeline-queue.service';
import { SiembrasService } from '../../entidades/siembra/service';

describe('Confirmacion de calculos fenologicos', () => {
  function setup() {
    const orden: string[] = [];
    const repo: any = {
      getActiveSowing: jest.fn().mockResolvedValue({ _id: 's1' }),
    };
    for (const metodo of [
      'reprocessClimate',
      'rebuildSanitaryPredictions',
      'evaluateAgroclimate',
      'recalculateIrrigation',
    ])
      repo[metodo] = jest.fn(async () => {
        orden.push(metodo);
      });
    let job: any;
    const queue: any = {
      add: jest.fn(
        async (_name, data, options) =>
          (job = {
            id: options.jobId,
            data,
            getState: jest.fn().mockResolvedValue('waiting'),
            update: jest.fn(async (data) => {
              job.data = data;
            }),
            progress: jest.fn(),
            attemptsMade: 0,
          }),
      ),
      getJob: jest.fn(async (id) => (job?.id === id ? job : undefined)),
      client: { set: jest.fn().mockResolvedValue('OK'), eval: jest.fn() },
    };
    const service = new DecisionPipelineQueueService(queue, repo);
    const processor = new DecisionPipelineProcessor(repo, service, queue);
    return { repo, service, processor, orden, queue };
  }
  it('confirma solo despues de clima, sanidad, agroclima y riego, y no recalcula al consultar', async () => {
    const c = setup();
    const job: any = await c.service.enqueueForSowing('s1', {
      trigger: 'siembra.phenology-recorded',
      changedFields: ['registrosFenologicos'],
      sincronizarClima: false,
      operationId: 'r1',
    });
    expect((await c.service.statusFenologia('s1', 'r1')).estado).toBe(
      'pendiente',
    );
    job.returnvalue = await c.processor.recomputeSowing(job);
    job.getState.mockResolvedValue('completed');
    job.finishedOn = Date.now();
    expect(await c.service.statusFenologia('s1', 'r1')).toMatchObject({
      estado: 'completado',
      completadoEn: expect.any(String),
    });
    expect(c.orden).toEqual([
      'reprocessClimate',
      'rebuildSanitaryPredictions',
      'evaluateAgroclimate',
      'recalculateIrrigation',
    ]);
    await c.service.statusFenologia('s1', 'r1');
    expect(c.queue.add).toHaveBeenCalledTimes(1);
    expect(c.repo.recalculateIrrigation).toHaveBeenCalledTimes(1);
    await c.processor.recomputeSowing(job);
    expect(c.repo.recalculateIrrigation).toHaveBeenCalledTimes(1);
  });
  it('no marca un trabajo ausente o fallido como completado ni filtra sus errores', async () => {
    const c = setup();
    expect((await c.service.statusFenologia('s1', 'missing')).estado).toBe(
      'no_disponible',
    );
    const job: any = await c.service.enqueueForSowing('s1', {
      trigger: 'siembra.phenology-recorded',
      changedFields: ['registrosFenologicos'],
      sincronizarClima: false,
      operationId: 'r1',
    });
    job.getState.mockResolvedValue('failed');
    job.failedReason = 'PRIVATE ERROR';
    expect(await c.service.statusFenologia('s1', 'r1')).toEqual({
      registroId: 'r1',
      estado: 'fallido',
    });
    expect(
      (await c.service.statusFenologia('another-sowing', 'r1')).estado,
    ).toBe('no_disponible');
  });
  it('no confirma riego fallido y reintenta solo lo pendiente', async () => {
    const c = setup();
    const job: any = await c.service.enqueueForSowing('s1', {
      trigger: 'siembra.phenology-recorded',
      changedFields: ['registrosFenologicos'],
      sincronizarClima: false,
      operationId: 'r1',
    });
    c.repo.recalculateIrrigation.mockRejectedValueOnce(
      new Error('persistencia riego'),
    );
    await expect(c.processor.recomputeSowing(job)).rejects.toThrow(
      'persistencia riego',
    );
    expect(job.data.completedStages.riego).toBeUndefined();
    expect((await c.service.statusFenologia('s1', 'r1')).estado).not.toBe(
      'completado',
    );
    await c.processor.recomputeSowing(job);
    expect(job.data.completedStages.riego).toEqual(expect.any(String));
    expect(c.repo.recalculateIrrigation).toHaveBeenCalledTimes(2);
    for (const metodo of [
      'reprocessClimate',
      'rebuildSanitaryPredictions',
      'evaluateAgroclimate',
    ]) {
      expect(c.repo[metodo]).toHaveBeenCalledTimes(1);
    }
  });
  it('exige acceso al lote y que el registro pertenezca a esa siembra antes de consultar Redis', async () => {
    const c = setup();
    const service = new SiembrasService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      c.service,
    );
    const access = jest
      .spyOn(service, 'getById')
      .mockRejectedValue(new Error('sin permiso'));
    await expect(
      service.estadoCalculoFenologico('s1', 'r1', {} as any),
    ).rejects.toThrow('sin permiso');
    expect(c.queue.getJob).not.toHaveBeenCalled();
    access.mockResolvedValue({ _id: 's1', registrosFenologicos: [] });
    await expect(
      service.estadoCalculoFenologico('s1', 'r1', {} as any),
    ).rejects.toThrow('Registro fenologico');
    expect(c.queue.getJob).not.toHaveBeenCalled();
  });
  it('ejecuta tambien riego sincronicamente si Redis no acepta el trabajo', async () => {
    const c = setup();
    c.queue.add.mockRejectedValue(new Error('redis offline'));
    await c.service.enqueueForSowing('s1', {
      trigger: 'siembra.phenology-recorded',
      changedFields: ['registrosFenologicos'],
      sincronizarClima: false,
      operationId: 'r1',
    });
    expect(c.repo.recalculateIrrigation).toHaveBeenCalledWith('s1');
  });
  it('acota una consulta Redis que no responde sin encolar otro calculo', async () => {
    jest.useFakeTimers();
    try {
      const c = setup();
      c.queue.getJob.mockImplementation(() => new Promise(() => undefined));
      const failure = expect(
        c.service.statusFenologia('s1', 'r1'),
      ).rejects.toThrow('Estado de calculos temporalmente no disponible.');
      jest.advanceTimersByTime(2500);
      await failure;
      expect(c.queue.add).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
