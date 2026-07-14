import { LotSoilIntelligenceEngine } from './engine.service';

describe('LotSoilIntelligenceEngine protection rules', () => {
  const updates = { updateOne: jest.fn() };
  const repository = { getByLot: jest.fn() };
  const engine = new LotSoilIntelligenceEngine(
    updates as any,
    repository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('nunca sobrescribe una textura operativa existente', async () => {
    await (engine as any).completeOperationalSoilIfEmpty(
      {
        _id: 'lot-1',
        texturaEscorrentia: 'Franco',
        sueloProcedencia: 'manual',
      },
      {
        estimatedTexture: 'Arcilloso',
        operationalTextureSource: 'soilgrids',
      },
    );
    expect(updates.updateOne).not.toHaveBeenCalled();
  });

  it('completa solamente campos vacios y marca la estimacion como no confirmada', async () => {
    repository.getByLot.mockResolvedValue({
      depthProfile: [
        {
          fieldCapacityPercentage: 31,
          wiltingPointPercentage: 14,
        },
      ],
    });
    await (engine as any).completeOperationalSoilIfEmpty(
      { _id: 'lot-2', suelos: [] },
      {
        estimatedTexture: 'Franco limoso',
        operationalTextureSource: 'soilgrids',
        availableWaterMmPerMeter: 170,
      },
    );
    expect(updates.updateOne).toHaveBeenCalledWith(
      { _id: 'lot-2' },
      {
        $set: expect.objectContaining({
          texturaLixiviacion: 'Franco limoso',
          texturaEscorrentia: 'Franco limoso',
          sueloProcedencia: 'soilgrids',
          sueloConfirmadoPorUsuario: false,
          capacidadDeCampo: 31,
          puntoMarchitez: 14,
        }),
      },
    );
  });
});
