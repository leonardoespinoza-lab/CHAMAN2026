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

  it('no conserva una ruta de autocompletado sobre campos legacy', () => {
    expect((engine as any).completeOperationalSoilIfEmpty).toBeUndefined();
    expect(updates.updateOne).not.toHaveBeenCalled();
  });

  it('documenta CC, PMP y agua disponible sobre 0-100 cm', () => {
    const provenance = (engine as any).provenance(
      {
        estimatedTexture: 'Franco limoso',
        availableWaterMmPerMeter: 170,
        effectiveDepthCm: 100,
      },
      [],
      [
        {
          depthFromCm: 0,
          depthToCm: 30,
          fieldCapacityPercentage: 31,
          wiltingPointPercentage: 14,
          confidence: 'medium',
          source: 'soilgrids',
        },
        {
          depthFromCm: 30,
          depthToCm: 100,
          fieldCapacityPercentage: 29,
          wiltingPointPercentage: 13,
          confidence: 'low',
          source: 'soilgrids',
        },
      ],
    );

    expect(provenance.fieldCapacityPercentage).toMatchObject({
      value: 29.6,
      depthFromCm: 0,
      depthToCm: 100,
      source: 'soilgrids',
      confidence: 'low',
    });
    expect(provenance.wiltingPointPercentage.value).toBe(13.3);
    expect(provenance.availableWaterMmPerMeter).toMatchObject({
      value: 170,
      depthFromCm: 0,
      depthToCm: 100,
    });
  });

  it('marca 100 cm como fallback operativo y no como profundidad medida', () => {
    expect((engine as any).effectiveDepth()).toEqual({
      value: 100,
      source: 'operational_fallback',
      confidence: 'low',
      isFallback: true,
    });
    expect(
      (engine as any).effectiveDepth({
        source: 'inta_local',
        rawAttributes: { profund_s1: 85 },
      }),
    ).toEqual({
      value: 85,
      source: 'inta_cartographic',
      confidence: 'medium',
      isFallback: false,
    });
  });

  it('fuerza confianza hidrica baja cuando SoilGrids no resuelve la escala del lote', () => {
    const provenance = (engine as any).provenance(
      {
        availableWaterMmPerMeter: 158,
        profileAvailableWaterMm: 158,
        effectiveDepthCm: 100,
        effectiveDepthSource: 'operational_fallback',
        effectiveDepthConfidence: 'low',
      },
      [],
      [
        {
          depthFromCm: 0,
          depthToCm: 100,
          fieldCapacityPercentage: 30,
          wiltingPointPercentage: 14.2,
          confidence: 'medium',
          source: 'soilgrids',
        },
      ],
      'low',
    );

    expect(provenance.availableWaterMmPerMeter.confidence).toBe('low');
    expect(provenance.profileAvailableWaterMm).toMatchObject({
      value: 158,
      confidence: 'low',
      observedOrEstimated: 'estimated',
    });
    expect(provenance.effectiveDepthCm).toMatchObject({
      source: 'derived',
      confidence: 'low',
      observedOrEstimated: 'reference',
    });
  });

  it('integra CC-PMP por espesor real y no extrapola un promedio superficial', () => {
    const profile = [
      {
        depthFromCm: 0,
        depthToCm: 30,
        availableWaterMmPerMeter: 180,
      },
      {
        depthFromCm: 30,
        depthToCm: 100,
        availableWaterMmPerMeter: 150,
      },
      {
        depthFromCm: 100,
        depthToCm: 200,
        availableWaterMmPerMeter: 100,
      },
    ];

    expect(
      (engine as any).integratedMetric(
        profile,
        'availableWaterMmPerMeter',
        0,
        200,
      ),
    ).toBe(259);
    expect(
      (engine as any).integratedMetric(
        profile.slice(0, 2),
        'availableWaterMmPerMeter',
        0,
        200,
      ),
    ).toBeUndefined();
    expect(
      (engine as any).integratedMetric(
        [profile[0], profile[2]],
        'availableWaterMmPerMeter',
        0,
        200,
      ),
    ).toBeUndefined();
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

  it('no invalida la clave por raices o remapeo de sensores', () => {
    const first = (engine as any).resolutionKey('lot-dynamic', 'geo', {
      sueloProcedencia: 'sensor',
      sueloConfirmadoPorUsuario: false,
      suelos: [
        {
          profundidad: 10,
          numeroDeSensor: 1,
          hayRaices: false,
          capacidadDeCampo: 30,
          puntoMarchitez: 14,
        },
      ],
    });
    const second = (engine as any).resolutionKey('lot-dynamic', 'geo', {
      sueloProcedencia: 'sensor',
      sueloConfirmadoPorUsuario: false,
      suelos: [
        {
          profundidad: 10,
          numeroDeSensor: 2,
          hayRaices: true,
          capacidadDeCampo: 30,
          puntoMarchitez: 14,
        },
      ],
    });

    expect(second).toBe(first);
  });

  it('conserva profundidad y propiedades fisicas en la clave de resolucion', () => {
    const base = {
      sueloProcedencia: 'sensor',
      sueloConfirmadoPorUsuario: false,
      suelos: [
        {
          profundidad: 10,
          numeroDeSensor: 1,
          capacidadDeCampo: 30,
          puntoMarchitez: 14,
        },
      ],
    };
    const first = (engine as any).resolutionKey('lot-physical', 'geo', base);
    const changedDepth = (engine as any).resolutionKey('lot-physical', 'geo', {
      ...base,
      suelos: [{ ...base.suelos[0], profundidad: 20 }],
    });
    const changedWater = (engine as any).resolutionKey('lot-physical', 'geo', {
      ...base,
      suelos: [{ ...base.suelos[0], capacidadDeCampo: 34 }],
    });

    expect(changedDepth).not.toBe(first);
    expect(changedWater).not.toBe(first);
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
