import { LotSoilIntelligenceEngine } from './engine.service';

describe('LotSoilIntelligenceEngine protection rules', () => {
  const updates = { updateOne: jest.fn(), findById: jest.fn() };
  const repository = { getByLot: jest.fn(), prepare: jest.fn() };
  const geometryNormalizer = { normalize: jest.fn() };
  const engine = new LotSoilIntelligenceEngine(
    updates as any,
    repository as any,
    geometryNormalizer as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('invalida una lectura cuando cambia la geometria', async () => {
    updates.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: 'lot-3', ubicacion: {} }),
    });
    geometryNormalizer.normalize.mockReturnValue({ geometryHash: 'new-geo' });
    repository.getByLot.mockResolvedValue({
      loteId: 'lot-3',
      status: 'ready',
      resolutionKey: 'old-key',
    });
    const refresh = jest
      .spyOn(engine, 'request')
      .mockResolvedValue({ loteId: 'lot-3', status: 'pending' } as any);

    await expect(engine.get('lot-3')).resolves.toMatchObject({
      status: 'pending',
    });
    expect(refresh).toHaveBeenCalledWith('lot-3', 'lazy_read');
  });

  it('incluye cambios manuales de suelo en la clave de resolucion', () => {
    const first = (engine as any).resolutionKey('lot-4', 'geo', {
      sueloProcedencia: 'manual',
      sueloConfirmadoPorUsuario: true,
      texturaEscorrentia: 'Franco',
    });
    const second = (engine as any).resolutionKey('lot-4', 'geo', {
      sueloProcedencia: 'manual',
      sueloConfirmadoPorUsuario: true,
      texturaEscorrentia: 'Arcilloso',
    });

    expect(first).not.toBe(second);
  });

  it('descarta una finalizacion si el lote cambio durante el calculo', async () => {
    updates.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: 'lot-4', ubicacion: {} }),
    });
    geometryNormalizer.normalize.mockReturnValue({ geometryHash: 'new-geo' });
    const oldResolutionKey = (engine as any).resolutionKey(
      'lot-4',
      'old-geo',
      {},
    );

    await expect(
      (engine as any).isCurrentResolution({
        lot: { _id: 'lot-4' },
        geometry: { geometryHash: 'old-geo' },
        resolutionKey: oldResolutionKey,
        reason: 'geometry_changed',
      }),
    ).resolves.toBe(false);
  });

  it('no invalida la clave por completar automaticamente suelo operativo', () => {
    const before = (engine as any).resolutionKey('lot-5', 'geo', {});
    const after = (engine as any).resolutionKey('lot-5', 'geo', {
      sueloProcedencia: 'soilgrids',
      sueloConfirmadoPorUsuario: false,
      texturaEscorrentia: 'Franco',
      texturaLixiviacion: 'Franco',
      capacidadDeCampo: 30,
      puntoMarchitez: 15,
      suelos: [{ profundidad: 30, textura: 'Franco' }],
    });

    expect(after).toBe(before);
  });

  it('trata una evaluacion parcial vigente como precalculada', async () => {
    const lot = { _id: 'lot-6', ubicacion: {} };
    updates.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(lot),
    });
    geometryNormalizer.normalize.mockReturnValue({ geometryHash: 'geo' });
    const current = {
      loteId: 'lot-6',
      status: 'partial',
      resolutionKey: (engine as any).resolutionKey('lot-6', 'geo', lot),
    };
    repository.getByLot.mockResolvedValue(current);

    await expect(engine.request('lot-6', 'backfill')).resolves.toBe(current);
    expect(repository.prepare).not.toHaveBeenCalled();
  });
});
