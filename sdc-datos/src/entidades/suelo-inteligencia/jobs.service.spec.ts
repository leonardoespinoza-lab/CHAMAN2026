import { SoilIntelligenceJobsService } from './jobs.service';

describe('SoilIntelligenceJobsService recovery guard', () => {
  it('no cuenta un reintento todavía parcial como perfil completado', async () => {
    const engine = {
      request: jest.fn().mockResolvedValue({ status: 'partial' }),
    };
    const repository = {
      claimPending: jest
        .fn()
        .mockResolvedValue([
          { loteId: 'lot-partial', status: 'processing', attempts: 1 },
        ]),
    };
    const jobs = new SoilIntelligenceJobsService(
      engine as any,
      repository as any,
    );
    await expect(jobs.recover()).resolves.toEqual({
      attempted: 1,
      completed: 0,
    });
    expect(engine.request).toHaveBeenCalledWith('lot-partial', 'failed_retry', {
      immediate: true,
      force: true,
    });
  });

  it('respeta el límite de intentos para no ciclar ante una fuente caída', async () => {
    const engine = { request: jest.fn() };
    const repository = {
      claimPending: jest
        .fn()
        .mockResolvedValue([
          { loteId: 'lot-exhausted', status: 'partial', attempts: 4 },
        ]),
    };
    await expect(
      new SoilIntelligenceJobsService(
        engine as any,
        repository as any,
      ).recover(),
    ).resolves.toEqual({ attempted: 1, completed: 0 });
    expect(engine.request).not.toHaveBeenCalled();
  });

  it('comparte una sola recuperacion cuando dos disparadores se solapan', async () => {
    let release: (value: unknown) => void = () => undefined;
    const engine = {
      request: jest.fn().mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }),
      ),
    };
    const repository = {
      claimPending: jest
        .fn()
        .mockResolvedValue([
          { loteId: 'lot-1', status: 'failed', attempts: 1 },
        ]),
    };
    const jobs = new SoilIntelligenceJobsService(
      engine as any,
      repository as any,
    );

    const first = jobs.recover();
    const second = jobs.recover();
    expect(second).toBe(first);
    await Promise.resolve();
    expect(repository.claimPending).toHaveBeenCalledTimes(1);

    release({ status: 'ready' });
    await expect(first).resolves.toEqual({ attempted: 1, completed: 1 });
  });
});
