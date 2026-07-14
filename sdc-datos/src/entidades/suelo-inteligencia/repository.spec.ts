import { SoilIntelligenceRepository } from './repository';

describe('SoilIntelligenceRepository generation protection', () => {
  it('finaliza solo la generacion que conserva la resolutionKey vigente', async () => {
    const assessments = {
      findOneAndUpdate: jest.fn().mockResolvedValue({ status: 'ready' }),
    };
    const repository = new SoilIntelligenceRepository(assessments as any);

    await repository.complete('lot-1', 'resolution-new', {
      status: 'ready',
    });

    expect(assessments.findOneAndUpdate).toHaveBeenCalledWith(
      { loteId: 'lot-1', resolutionKey: 'resolution-new' },
      { $set: { status: 'ready' } },
      { new: true },
    );
  });

  it('reintenta pendientes enseguida pero aplica backoff a parciales y fallidos', async () => {
    const lean = jest.fn().mockResolvedValue(null);
    const assessments = {
      findOneAndUpdate: jest.fn().mockReturnValue({ lean }),
    };
    const repository = new SoilIntelligenceRepository(assessments as any);

    await repository.claimPending(1);

    const filter = assessments.findOneAndUpdate.mock.calls[0][0];
    expect(filter.$or).toEqual(
      expect.arrayContaining([
        { status: 'pending' },
        expect.objectContaining({
          status: { $in: ['partial', 'failed'] },
          updatedAt: { $lt: expect.any(Date) },
        }),
      ]),
    );
  });
});
