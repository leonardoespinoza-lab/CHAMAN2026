import { SoilIntelligenceJobsService } from './jobs.service';

describe('SoilIntelligenceJobsService recovery guard', () => {
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
