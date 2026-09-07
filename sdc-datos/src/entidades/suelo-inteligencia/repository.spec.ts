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

  it('recupera ready incompleto sin seleccionar perfiles de seis capas válidas', async () => {
    const assessments = {
      findOneAndUpdate: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    };
    await new SoilIntelligenceRepository(assessments as any).claimPending(1);
    const filter = assessments.findOneAndUpdate.mock.calls[0][0];
    expect(filter.attempts).toEqual({ $lt: 4 });
    const ready = filter.$or.find((condition) => condition.status === 'ready');
    expect(ready.updatedAt.$lt).toBeInstanceOf(Date);
    expect(ready.$or).toHaveLength(6);
    expect(
      ready.$or.map(
        (condition) => condition.depthProfile.$not.$elemMatch.depthFromCm,
      ),
    ).toEqual([0, 5, 15, 30, 60, 100]);
    for (const condition of ready.$or) {
      expect(condition.depthProfile.$not.$elemMatch).toMatchObject({
        sandQ50: { $type: 'number', $gte: 0, $lte: 100 },
        siltQ50: { $type: 'number', $gte: 0, $lte: 100 },
        clayQ50: { $type: 'number', $gte: 0, $lte: 100 },
      });
    }
  });

  it('reserva como máximo el límite solicitado y mantiene el control de generación', async () => {
    const assessments = {
      findOneAndUpdate: jest
        .fn()
        .mockReturnValue({
          lean: jest
            .fn()
            .mockResolvedValue({
              loteId: 'lot-partial',
              status: 'processing',
              attempts: 1,
            }),
        }),
    };
    const result = await new SoilIntelligenceRepository(
      assessments as any,
    ).claimPending(1);
    expect(result).toHaveLength(1);
    expect(assessments.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(assessments.findOneAndUpdate.mock.calls[0][1].$set.status).toBe(
      'processing',
    );
  });
});
