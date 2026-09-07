import { IPerfilProfundidadSuelo } from 'modelos/src';
import { model, models } from 'mongoose';
import { SOILGRIDS_DEPTHS } from './config/soilgrids.config';
import { LotSoilIntelligenceEngine } from './engine.service';
import { LotSoilAssessmentSchema } from './modelos/schema';
import { SoilTextureClassifier } from './texture-classifier.service';

const LOT_ID = 'lot-soil-coverage';
const clone = <T>(value: T): T => structuredClone(value);

function sixLayers(): IPerfilProfundidadSuelo[] {
  return SOILGRIDS_DEPTHS.map((depth, index) => ({
    depthFromCm: depth.fromCm,
    depthToCm: depth.toCm,
    sandQ50: 40,
    siltQ50: 40,
    clayQ50: 20,
    fieldCapacityPercentage: 30 + index,
    wiltingPointPercentage: 14,
    availableWaterMmPerMeter: 160 + index * 10,
    phWater: 7,
    organicCarbonGKg: 12,
    organicMatterEstimatedPercentage: 2.07,
    cecCmolKg: 18,
    bulkDensityKgDm3: 1.3,
    coarseFragmentsPercentage: 2,
    source: 'soilgrids',
    confidence: 'medium',
    coveragePercentage: 100,
    validPixels: 24,
    qualityFlags: [`fixture-${depth.code}`],
  }));
}

/** In-memory persistence only; providers never perform HTTP or Mongo calls. */
function fixture(freshProfile: IPerfilProfundidadSuelo[]) {
  let lot: any = { _id: LOT_ID, ubicacion: { fixture: true } };
  let geometryHash = 'geometry-current';
  let stored: any = null;
  const lots = {
    findById: jest.fn(() => ({ lean: jest.fn(async () => clone(lot)) })),
    updateOne: jest.fn(),
  };
  const repository = {
    getByLot: jest.fn(async () => clone(stored)),
    prepare: jest.fn(async (data: any) => {
      stored = { ...stored, ...clone(data) };
      return clone(stored);
    }),
    complete: jest.fn(async (loteId: string, key: string, data: any) => {
      if (stored?.loteId !== loteId || stored?.resolutionKey !== key)
        return null;
      stored = { ...stored, ...clone(data) };
      return clone(stored);
    }),
  };
  const geometryNormalizer = {
    normalize: jest.fn(() => ({ geometryHash, areaM2: 200_000, warnings: [] })),
  };
  const location = {
    getCurrent: jest.fn(async () => ({ provincia: { nombre: 'Córdoba' } })),
  };
  const inta = {
    assess: jest.fn(async () => ({
      units: [],
      coveragePercentage: 0,
      confidence: 'unavailable',
      sourceVersions: {},
      warnings: [],
      failedLayers: [],
    })),
  };
  const soilgrids = {
    assess: jest.fn(async () => ({
      profile: clone(freshProfile),
      coveragePercentage: freshProfile.length ? 100 : 0,
      resolutionMeters: 250,
      confidence: 'medium',
      sourceVersion: 'fixture-soilgrids',
      warnings: [],
    })),
  };
  const confidence = {
    calculate: jest.fn(() => ({ score: 0.6, level: 'medium', factors: [] })),
  };
  const engine = new LotSoilIntelligenceEngine(
    lots as any,
    repository as any,
    geometryNormalizer as any,
    location as any,
    inta as any,
    soilgrids as any,
    new SoilTextureClassifier(),
    confidence as any,
  );
  const key = () => (engine as any).resolutionKey(LOT_ID, geometryHash, lot);
  const cache = (profile: IPerfilProfundidadSuelo[], extra: any = {}) => {
    stored = {
      loteId: LOT_ID,
      geometryHash,
      resolutionKey: key(),
      status: 'ready',
      attempts: 1,
      depthProfile: clone(profile),
      soilUnits: [],
      propertyProvenance: {},
      warnings: [],
      ...clone(extra),
    };
    return clone(stored);
  };
  return {
    engine,
    lots,
    repository,
    inta,
    soilgrids,
    cache,
    stored: () => clone(stored),
    changeGeometry: () => {
      geometryHash = 'geometry-replaced';
    },
    changeManualResolution: () => {
      lot = {
        ...lot,
        sueloProcedencia: 'manual',
        sueloConfirmadoPorUsuario: true,
        capacidadDeCampo: 35,
      };
    },
  };
}

describe('LotSoilIntelligenceEngine complete depth coverage', () => {
  it('persists two noncontiguous horizons as partial, without 0–30 or 0–100 summaries', async () => {
    const layers = sixLayers();
    const partial = [layers[0], layers[5]];
    const f = fixture(partial);

    const result = await f.engine.request(LOT_ID, 'backfill', {
      immediate: true,
    });

    expect(result.status).toBe('partial');
    expect(result.depthProfile).toEqual(partial);
    expect(result.summary?.sandPercentage).toBeUndefined();
    expect(result.summary?.siltPercentage).toBeUndefined();
    expect(result.summary?.clayPercentage).toBeUndefined();
    expect(result.summary?.canonicalTexture).toBeUndefined();
    expect(result.summary?.availableWaterMmPerMeter).toBeUndefined();
    expect(result.summary?.profileAvailableWaterMm).toBeUndefined();
    expect(result.summary?.rootZoneAvailableWaterMm).toBeUndefined();
    expect(result.summary?.ph).toBeUndefined();
    expect(
      result.propertyProvenance?.fieldCapacityPercentage?.value,
    ).toBeUndefined();
    expect(
      result.propertyProvenance?.wiltingPointPercentage?.value,
    ).toBeUndefined();
    expect(result.propertyProvenance?.fieldCapacityPercentage?.confidence).toBe(
      'unavailable',
    );
    expect(result.propertyProvenance?.wiltingPointPercentage?.confidence).toBe(
      'unavailable',
    );
    expect(result.warnings?.join(' ')).toMatch(
      /5–15 cm.*15–30 cm.*30–60 cm.*60–100 cm/,
    );
    expect(f.stored().status).toBe('partial');
    expect(f.stored().depthProfile).toEqual(partial);
    expect(f.lots.updateOne).not.toHaveBeenCalled();
  });

  it('keeps the six-layer result ready and preserves the prior weighted values', async () => {
    const layers = sixLayers();
    const f = fixture(layers);

    const result = await f.engine.request(LOT_ID, 'backfill', {
      immediate: true,
    });

    expect(result.status).toBe('ready');
    expect(result.depthProfile).toEqual(layers);
    expect(result.summary).toMatchObject({
      sandPercentage: 40,
      siltPercentage: 40,
      clayPercentage: 20,
      canonicalTexture: 'Franco',
      availableWaterMmPerMeter: 189,
      profileAvailableWaterMm: 189,
      rootZoneAvailableWaterMm: 189,
      effectiveDepthCm: 100,
      ph: 7,
      organicCarbonGKg: 12,
      organicMatterEstimatedPercentage: 2.07,
      cecCmolKg: 18,
      bulkDensityKgDm3: 1.3,
      coarseFragmentsPercentage: 2,
    });
    expect(result.propertyProvenance?.fieldCapacityPercentage?.value).toBe(
      32.9,
    );
    expect(result.propertyProvenance?.wiltingPointPercentage?.value).toBe(14);
    expect(result.warnings?.join(' ')).not.toMatch(
      /Perfil de suelo incompleto/,
    );
    expect(f.lots.updateOne).not.toHaveBeenCalled();
  });

  it('completes a retry with four fresh horizons while preserving the two valid cached horizons', async () => {
    const layers = sixLayers();
    const old = [layers[0], layers[5]];
    const f = fixture(layers.slice(1, 5));
    const cached = f.cache(old, { status: 'partial' });

    const result = await f.engine.request(LOT_ID, 'partial_retry', {
      immediate: true,
      force: true,
    });

    expect(result.status).toBe('ready');
    expect(result.depthProfile).toEqual(layers);
    expect(result.depthProfile?.[0]).toEqual(cached.depthProfile[0]);
    expect(result.depthProfile?.[5]).toEqual(cached.depthProfile[1]);
    expect(result.warnings?.join(' ')).toMatch(/Se conservaron capas válidas/);
    expect(cached.depthProfile).toEqual(old);
    expect(f.soilgrids.assess).toHaveBeenCalledTimes(1);
  });

  it('does not degrade a complete cached profile when a forced read only returns two horizons', async () => {
    const layers = sixLayers();
    const f = fixture([layers[0], layers[5]]);
    f.cache(layers);

    const result = await f.engine.request(LOT_ID, 'partial_retry', {
      immediate: true,
      force: true,
    });

    expect(result.status).toBe('ready');
    expect(result.depthProfile).toEqual(layers);
    expect(result.summary?.availableWaterMmPerMeter).toBe(189);
    expect(result.warnings?.join(' ')).toMatch(/Se conservaron capas válidas/);
  });

  it.each(['geometry', 'manual resolution'] as const)(
    'never inherits cached horizons after the %s changes',
    async (change) => {
      const layers = sixLayers();
      const fresh = layers.slice(1, 5);
      const f = fixture(fresh);
      const old = f.cache([layers[0], layers[5]], { status: 'partial' });
      if (change === 'geometry') f.changeGeometry();
      else f.changeManualResolution();

      const result = await f.engine.request(LOT_ID, 'backfill', {
        immediate: true,
        force: true,
      });

      expect(result.resolutionKey).not.toBe(old.resolutionKey);
      expect(result.status).toBe('partial');
      expect(result.depthProfile).toEqual(fresh);
      expect(
        result.depthProfile?.some((layer) => layer.depthFromCm === 0),
      ).toBe(false);
      expect(
        result.depthProfile?.some((layer) => layer.depthFromCm === 100),
      ).toBe(false);
      expect(result.summary?.availableWaterMmPerMeter).toBeUndefined();
      expect(result.warnings?.join(' ')).not.toMatch(
        /Se conservaron capas válidas/,
      );
    },
  );

  it.each(['get', 'request'] as const)(
    '%s sanitizes legacy ready/two-layer summaries without mutating the stored record or refetching',
    async (method) => {
      const layers = sixLayers();
      const f = fixture(layers);
      const original = f.cache([layers[0], layers[5]], {
        summary: {
          depthFromCm: 0,
          depthToCm: 30,
          sandPercentage: 17.3,
          siltPercentage: 57.2,
          clayPercentage: 25.6,
          canonicalTexture: 'Franco limoso',
          estimatedTexture: 'Franco limoso',
          operationalTexture: 'Franco limoso',
          operationalTextureSource: 'soilgrids',
          availableWaterMmPerMeter: 175.1,
          profileAvailableWaterMm: 175.1,
          rootZoneAvailableWaterMm: 175.1,
          effectiveDepthCm: 100,
          ph: 7,
        },
        propertyProvenance: {
          availableWaterMmPerMeter: {
            value: 175.1,
            source: 'soilgrids',
            confidence: 'medium',
            depthFromCm: 0,
            depthToCm: 100,
          },
        },
      });

      const result =
        method === 'get'
          ? await f.engine.get(LOT_ID)
          : await f.engine.request(LOT_ID, 'lazy_read');

      expect(result?.status).toBe('partial');
      expect(result?.depthProfile).toEqual(original.depthProfile);
      expect(result?.summary?.sandPercentage).toBeUndefined();
      expect(result?.summary?.siltPercentage).toBeUndefined();
      expect(result?.summary?.clayPercentage).toBeUndefined();
      expect(result?.summary?.canonicalTexture).toBeUndefined();
      expect(result?.summary?.availableWaterMmPerMeter).toBeUndefined();
      expect(result?.summary?.profileAvailableWaterMm).toBeUndefined();
      expect(result?.summary?.rootZoneAvailableWaterMm).toBeUndefined();
      expect(
        result?.propertyProvenance?.availableWaterMmPerMeter,
      ).toMatchObject({ value: null, confidence: 'unavailable' });
      expect(result?.warnings?.join(' ')).toMatch(/Perfil de suelo incompleto/);
      expect(f.stored()).toEqual(original);
      expect(f.repository.prepare).not.toHaveBeenCalled();
      expect(f.repository.complete).not.toHaveBeenCalled();
      expect(f.inta.assess).not.toHaveBeenCalled();
      expect(f.soilgrids.assess).not.toHaveBeenCalled();
    },
  );

  it.each(['get', 'request'] as const)(
    '%s reuses a valid six-layer cache unchanged',
    async (method) => {
      const f = fixture([]);
      const original = f.cache(sixLayers(), {
        summary: {
          sandPercentage: 40,
          siltPercentage: 40,
          clayPercentage: 20,
          availableWaterMmPerMeter: 189,
        },
      });

      const result =
        method === 'get'
          ? await f.engine.get(LOT_ID)
          : await f.engine.request(LOT_ID, 'lazy_read');

      expect(result).toEqual(original);
      expect(f.stored()).toEqual(original);
      expect(f.repository.prepare).not.toHaveBeenCalled();
      expect(f.repository.complete).not.toHaveBeenCalled();
      expect(f.soilgrids.assess).not.toHaveBeenCalled();
    },
  );

  it.each(['pending', 'ready'] as const)(
    'normalizes a real offline Mongoose %s document before sanitizing its two-layer profile',
    (status) => {
      const layers = sixLayers();
      const f = fixture([]);
      const original = f.cache([layers[0], layers[5]], {
        status,
        summary: {
          depthFromCm: 0,
          depthToCm: 30,
          sandPercentage: 17.3,
          siltPercentage: 57.2,
          clayPercentage: 25.6,
          availableWaterMmPerMeter: 175.1,
          profileAvailableWaterMm: 175.1,
          effectiveDepthCm: 100,
        },
      });
      const Assessment =
        models.SoilCoverageOfflineAssessment ||
        model('SoilCoverageOfflineAssessment', LotSoilAssessmentSchema);
      // Construction is local only: no connection, save(), or Mongo request.
      const document = new Assessment(original);
      expect((document as any).$__).toBeDefined();

      const result = (f.engine as any).validatedCoverage(document);

      expect(result.loteId).toBe(LOT_ID);
      expect(result.resolutionKey).toBe(original.resolutionKey);
      expect(result.geometryHash).toBe(original.geometryHash);
      expect(result.depthProfile).toEqual(original.depthProfile);
      expect(result.status).toBe(status === 'ready' ? 'partial' : 'pending');
      expect(result.summary.sandPercentage).toBeUndefined();
      expect(result.summary.siltPercentage).toBeUndefined();
      expect(result.summary.clayPercentage).toBeUndefined();
      expect(result.summary.availableWaterMmPerMeter).toBeUndefined();
      expect(result.summary.profileAvailableWaterMm).toBeUndefined();
      expect(result).not.toHaveProperty('$__');
      expect(result).not.toHaveProperty('_doc');
      expect((document as any).summary.availableWaterMmPerMeter).toBe(175.1);
      expect(f.repository.prepare).not.toHaveBeenCalled();
      expect(f.repository.complete).not.toHaveBeenCalled();
      expect(f.soilgrids.assess).not.toHaveBeenCalled();
    },
  );

  it('cannot resurrect old geometry horizons after a failed replacement and subsequent retry', async () => {
    const layers = sixLayers();
    const fresh = layers.slice(1, 5);
    const f = fixture(fresh);
    const old = f.cache([layers[0], layers[5]], {
      summary: { availableWaterMmPerMeter: 175.1 },
      source: { type: 'soilgrids', provider: 'old-geometry-provider' },
    });
    f.changeGeometry();
    f.soilgrids.assess.mockRejectedValueOnce(new Error('Simulated WCS outage'));

    await expect(
      f.engine.request(LOT_ID, 'geometry_changed', {
        immediate: true,
        force: true,
      }),
    ).rejects.toThrow('Simulated WCS outage');
    // Flush the engine's asynchronous failure persistence before retrying.
    await new Promise<void>((resolve) => setImmediate(resolve));

    const failed = f.stored();
    expect(failed.status).toBe('failed');
    expect(failed.resolutionKey).not.toBe(old.resolutionKey);
    expect(failed.depthProfile).toEqual([]);
    expect(failed.summary).toBeNull();
    expect(failed.source).toBeNull();

    const result = await f.engine.request(LOT_ID, 'failed_retry', {
      immediate: true,
      force: true,
    });

    expect(result.status).toBe('partial');
    expect(result.depthProfile).toEqual(fresh);
    expect(result.depthProfile).toHaveLength(4);
    expect(result.summary?.availableWaterMmPerMeter).toBeUndefined();
    expect(result.warnings?.join(' ')).not.toMatch(
      /Se conservaron capas válidas/,
    );
    expect(f.soilgrids.assess).toHaveBeenCalledTimes(2);
  });

  it('removes stale hydraulic and pH summaries when all textures exist but their property coverage is incomplete', async () => {
    const layers = sixLayers();
    layers[1].availableWaterMmPerMeter = undefined;
    layers[1].phWater = undefined;
    const f = fixture([]);
    const original = f.cache(layers, {
      summary: {
        sandPercentage: 40,
        siltPercentage: 40,
        clayPercentage: 20,
        canonicalTexture: 'Franco',
        availableWaterMmPerMeter: 175.1,
        profileAvailableWaterMm: 175.1,
        rootZoneAvailableWaterMm: 175.1,
        effectiveDepthCm: 100,
        ph: 7,
      },
      propertyProvenance: {
        availableWaterMmPerMeter: {
          value: 175.1,
          source: 'soilgrids',
          confidence: 'medium',
          depthFromCm: 0,
          depthToCm: 100,
        },
        ph: {
          value: 7,
          source: 'soilgrids',
          confidence: 'medium',
          depthFromCm: 0,
          depthToCm: 30,
        },
      },
    });

    const result = await f.engine.get(LOT_ID);

    expect(result?.status).toBe('ready');
    expect(result?.depthProfile).toEqual(layers);
    expect(result?.summary).toMatchObject({
      sandPercentage: 40,
      siltPercentage: 40,
      clayPercentage: 20,
      canonicalTexture: 'Franco',
    });
    expect(result?.summary?.availableWaterMmPerMeter).toBeUndefined();
    expect(result?.summary?.profileAvailableWaterMm).toBeUndefined();
    expect(result?.summary?.rootZoneAvailableWaterMm).toBeUndefined();
    expect(result?.summary?.ph).toBeUndefined();
    expect(result?.propertyProvenance?.availableWaterMmPerMeter).toMatchObject({
      value: null,
      confidence: 'unavailable',
    });
    expect(result?.propertyProvenance?.ph).toMatchObject({
      value: null,
      confidence: 'unavailable',
    });
    expect(f.stored()).toEqual(original);
    expect(f.repository.prepare).not.toHaveBeenCalled();
    expect(f.repository.complete).not.toHaveBeenCalled();
    expect(f.inta.assess).not.toHaveBeenCalled();
    expect(f.soilgrids.assess).not.toHaveBeenCalled();
  });
});
