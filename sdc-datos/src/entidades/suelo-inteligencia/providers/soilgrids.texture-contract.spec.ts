import { Logger } from '@nestjs/common';
import { SOILGRIDS_DEPTHS } from '../config/soilgrids.config';
import { SoilTextureClassifier } from '../texture-classifier.service';
import { SoilGridsProvider } from './soilgrids.provider';

// Synthetic fixtures: these values are not observations from a production lot.
// Exercise the public provider path with an in-memory WCS boundary, so separate
// marginal Q50 predictions need not add to 100 before compositional closure.
const geometry = {
  geometryHash: 'synthetic-texture-contract-polygon',
  areaM2: 1_230_846,
  geometry: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [0, 0],
        [0.01, 0],
        [0.01, 0.01],
        [0, 0.01],
        [0, 0],
      ],
    ],
  },
  representativePoint: {
    type: 'Point' as const,
    coordinates: [0.005, 0.005] as [number, number],
  },
  warnings: [],
  swappedCoordinates: false,
};

type Fractions = [unknown, unknown, unknown];
type Support = { gridHash: string; validMaskHash: string };
type Stats = {
  weightedMean: unknown;
  median: unknown;
  spatialLow: unknown;
  spatialHigh: unknown;
  standardDeviation: number;
  validPixels: number;
  coveragePercentage: number;
  spatialSupport?: Support;
};

const fractionsIndex = { sand: 0, silt: 1, clay: 2 };
const nonTextureValues = {
  bdod: 1.3,
  cfvo: 4,
  phh2o: 6.2,
  soc: 12,
  nitrogen: 1.1,
  cec: 18,
  wv0033: 33,
  wv1500: 14,
};

function mockCoverage(
  provider: SoilGridsProvider,
  values: Fractions,
  options: {
    atDepth?: string;
    missingQuantile?: 'Q0.05' | 'Q0.95';
    adjust?: (
      stats: Stats,
      property: string,
      depth: string,
      quantile: string,
    ) => Stats;
  } = {},
) {
  return jest
    .spyOn(provider as any, 'readCoverage')
    .mockImplementation(
      async (_geometry, property: string, depth: string, quantile: string) => {
        const textureIndex = fractionsIndex[property];
        const isTexture = textureIndex !== undefined;
        if (
          isTexture &&
          property === 'sand' &&
          options.missingQuantile === quantile
        ) {
          throw new Error('Synthetic missing nonessential marginal quantile');
        }
        const selected: Fractions =
          !options.atDepth || options.atDepth === depth ? values : [40, 35, 25];
        let value = isTexture
          ? selected[textureIndex]
          : nonTextureValues[property];
        if (isTexture && typeof value === 'number' && Number.isFinite(value)) {
          if (quantile === 'Q0.05') value *= 0.8;
          if (quantile === 'Q0.95') value = Math.min(100, value * 1.2);
        }
        const stats: Stats = {
          weightedMean: value,
          median: value,
          spatialLow: value,
          spatialHigh: value,
          standardDeviation: 0,
          validPixels: 4,
          coveragePercentage: 100,
          spatialSupport: {
            gridHash: `synthetic-epsg4326-grid-${depth}`,
            validMaskHash: `synthetic-polygon-valid-mask-${depth}`,
          },
        };
        return options.adjust
          ? options.adjust(stats, property, depth, quantile)
          : stats;
      },
    );
}

describe('SoilGrids marginal texture composition contract', () => {
  let previousWcsEnabled: string | undefined;

  beforeEach(() => {
    previousWcsEnabled = process.env.SOILGRIDS_WCS_ENABLED;
    delete process.env.SOILGRIDS_WCS_ENABLED;
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (previousWcsEnabled === undefined)
      delete process.env.SOILGRIDS_WCS_ENABLED;
    else process.env.SOILGRIDS_WCS_ENABLED = previousWcsEnabled;
  });

  it.each([
    { label: 'proof of marginal sums', values: [20, 20, 20], sum: 60 },
    {
      label: 'synthetic lower-sum example',
      values: [12.34, 46.78, 21.44],
      sum: 80.56,
    },
    { label: 'synthetic higher-sum example', values: [50, 45, 35], sum: 130 },
  ])(
    'keeps all six co-located horizons for $label',
    async ({ values, sum }) => {
      const provider = new SoilGridsProvider(new SoilTextureClassifier());
      const read = mockCoverage(provider, values as Fractions);
      const result = await provider.assess(geometry);

      expect(result.profile).toHaveLength(6);
      expect(
        result.profile.map((layer) => [layer.depthFromCm, layer.depthToCm]),
      ).toEqual(SOILGRIDS_DEPTHS.map((depth) => [depth.fromCm, depth.toCm]));
      expect(result.warnings).toEqual([]);
      expect(result.coveragePercentage).toBe(100);
      expect(result.confidence).toBe('low');
      for (const layer of result.profile) {
        expect(layer.textureCompositionOriginalSum).toBeCloseTo(sum, 2);
        expect(layer.textureCompositionClosureApplied).toBe(true);
        expect(layer.sandQ50).toBeCloseTo((values[0] * 100) / sum, 2);
        expect(layer.siltQ50).toBeCloseTo((values[1] * 100) / sum, 2);
        expect(layer.clayQ50).toBeCloseTo((values[2] * 100) / sum, 2);
        expect(layer.sandQ50 + layer.siltQ50 + layer.clayQ50).toBeCloseTo(
          100,
          1,
        );
        expect(layer.usdaTexture).toBeTruthy();
        expect(layer.chamanTexture).toBeTruthy();
        expect(layer.confidence).toBe('low');
        expect(layer.qualityFlags.join(' ')).toMatch(/composicional/i);
        expect(layer.qualityFlags.join(' ')).toContain(sum.toFixed(2));
        expect(layer.fieldCapacityPercentage).toBe(33);
        expect(layer.wiltingPointPercentage).toBe(14);
        expect(layer.availableWaterMmPerMeter).toBe(190);
      }
      // No replacement of Q50 by a different statistical product.
      expect(
        read.mock.calls.every((call) =>
          ['Q0.05', 'Q0.5', 'Q0.95'].includes(call[3] as string),
        ),
      ).toBe(true);
    },
  );

  it('preserves the existing 90.5 closure result, predictive quantiles and metadata', async () => {
    const provider = new SoilGridsProvider(new SoilTextureClassifier());
    mockCoverage(provider, [8, 55, 27.5]);
    const result = await provider.assess(geometry);

    expect(result.profile).toHaveLength(6);
    expect(result.confidence).toBe('medium');
    expect(result.profile[0]).toMatchObject({
      sandQ05: 6.4,
      sandQ50: 8.84,
      sandQ95: 9.6,
      siltQ05: 44,
      siltQ50: 60.77,
      siltQ95: 66,
      clayQ05: 22,
      clayQ50: 30.39,
      clayQ95: 33,
      textureCompositionOriginalSum: 90.5,
      textureCompositionClosureApplied: true,
      validPixels: 4,
      coveragePercentage: 100,
      bulkDensityKgDm3: 1.3,
      phWater: 6.2,
      fieldCapacityPercentage: 33,
      wiltingPointPercentage: 14,
      availableWaterMmPerMeter: 190,
      confidence: 'low',
      source: 'soilgrids',
    });
    expect(result.profile[0].qualityFlags.join(' ')).toMatch(/90\.50/);
  });

  it('does not flag a composition already closed to 100 as normalized', async () => {
    const provider = new SoilGridsProvider(new SoilTextureClassifier());
    mockCoverage(provider, [40, 35, 25]);
    const result = await provider.assess(geometry);

    expect(result.profile).toHaveLength(6);
    expect(result.profile[0]).toMatchObject({
      sandQ50: 40,
      siltQ50: 35,
      clayQ50: 25,
      textureCompositionOriginalSum: 100,
      textureCompositionClosureApplied: false,
    });
    expect(result.profile[0].qualityFlags.join(' ')).not.toMatch(
      /Cierre composicional/i,
    );
  });

  it.each([
    ['NaN', NaN],
    ['positive infinity', Infinity],
    ['negative infinity', -Infinity],
    ['null', null],
    ['undefined', undefined],
    ['numeric string', '20'],
    ['empty string', ''],
    ['negative', -1],
    ['over 100', 100.01],
  ])(
    'rejects an invalid %s fraction without dropping the other five horizons',
    async (_label, value) => {
      const provider = new SoilGridsProvider(new SoilTextureClassifier());
      const invalidDepth = SOILGRIDS_DEPTHS[2];
      mockCoverage(provider, [value, 40, 30], { atDepth: invalidDepth.code });
      const result = await provider.assess(geometry);

      expect(result.profile.map((layer) => layer.depthFromCm)).toEqual(
        SOILGRIDS_DEPTHS.filter(
          (depth) => depth.code !== invalidDepth.code,
        ).map((depth) => depth.fromCm),
      );
      expect(
        result.warnings.some((warning) => warning.includes('15–30 cm')),
      ).toBe(true);
      expect(
        result.profile.every((layer) => Number.isFinite(layer.sandQ50)),
      ).toBe(true);
    },
  );

  it('rejects an all-zero composition without manufacturing texture', async () => {
    const provider = new SoilGridsProvider(new SoilTextureClassifier());
    mockCoverage(provider, [0, 0, 0]);
    const result = await provider.assess(geometry);

    expect(result.profile).toEqual([]);
    expect(result.coveragePercentage).toBe(0);
    expect(result.confidence).toBe('unavailable');
    expect(result.warnings).toHaveLength(7);
  });

  it.each(['gridHash', 'validMaskHash', 'missingSupport'])(
    'rejects a Q50 %s mismatch while retaining co-located adjacent horizons',
    async (invalidSupport) => {
      const provider = new SoilGridsProvider(new SoilTextureClassifier());
      mockCoverage(provider, [40, 35, 25], {
        adjust: (stats, property, depth, quantile) => {
          if (property !== 'clay' || depth !== '5-15cm' || quantile !== 'Q0.5')
            return stats;
          if (invalidSupport === 'missingSupport')
            return { ...stats, spatialSupport: undefined };
          return {
            ...stats,
            spatialSupport: {
              ...stats.spatialSupport,
              [invalidSupport]: 'different-support',
            },
          };
        },
      });
      const result = await provider.assess(geometry);

      expect(result.profile.map((layer) => layer.depthFromCm)).toEqual([
        0, 15, 30, 60, 100,
      ]);
      expect(
        result.warnings.some((warning) => warning.includes('5–15 cm')),
      ).toBe(true);
    },
  );

  it.each(['Q0.05', 'Q0.95'] as const)(
    'retains the horizon without %s but does not assign normal uncertainty confidence',
    async (missingQuantile) => {
      const provider = new SoilGridsProvider(new SoilTextureClassifier());
      mockCoverage(provider, [40, 35, 25], { missingQuantile });
      const result = await provider.assess(geometry);

      expect(result.profile).toHaveLength(6);
      expect(result.warnings).toEqual([]);
      for (const layer of result.profile) {
        expect(
          layer[missingQuantile === 'Q0.05' ? 'sandQ05' : 'sandQ95'],
        ).toBeUndefined();
        expect(layer.sandQ50).toBe(40);
        expect(layer.siltQ50).toBe(35);
        expect(layer.clayQ50).toBe(25);
        expect(layer.confidence).toBe('low');
      }
    },
  );

  it.each(['Q0.05', 'Q0.95'] as const)(
    'retains Q50 when %s is inconsistent but lowers layer confidence',
    async (inconsistentQuantile) => {
      const provider = new SoilGridsProvider(new SoilTextureClassifier());
      mockCoverage(provider, [40, 35, 25], {
        adjust: (stats, property, _depth, quantile) =>
          property === 'sand' && quantile === inconsistentQuantile
            ? {
                ...stats,
                weightedMean: inconsistentQuantile === 'Q0.05' ? 45 : 35,
              }
            : stats,
      });
      const result = await provider.assess(geometry);

      expect(result.profile).toHaveLength(6);
      expect(result.profile.every((layer) => layer.sandQ50 === 40)).toBe(true);
      expect(result.profile.every((layer) => layer.confidence === 'low')).toBe(
        true,
      );
    },
  );

  it.each([
    ['Q0.05', 'gridHash', 'sandQ05'],
    ['Q0.05', 'validMaskHash', 'sandQ05'],
    ['Q0.95', 'gridHash', 'sandQ95'],
    ['Q0.95', 'validMaskHash', 'sandQ95'],
  ])(
    'suppresses optional %s with incompatible %s without dropping its horizon',
    async (quantileToChange, hashToChange, fieldToSuppress) => {
      const provider = new SoilGridsProvider(new SoilTextureClassifier());
      mockCoverage(provider, [40, 35, 25], {
        adjust: (stats, property, _depth, quantile) =>
          property === 'sand' && quantile === quantileToChange
            ? {
                ...stats,
                spatialSupport: {
                  ...stats.spatialSupport,
                  [hashToChange]: 'synthetic-incompatible-optional-support',
                },
              }
            : stats,
      });
      const result = await provider.assess(geometry);

      expect(result.profile).toHaveLength(6);
      expect(result.warnings).toEqual([]);
      for (const layer of result.profile) {
        expect(layer[fieldToSuppress]).toBeUndefined();
        expect(layer[fieldToSuppress === 'sandQ05' ? 'sandQ95' : 'sandQ05'])
          .toBe(fieldToSuppress === 'sandQ05' ? 48 : 32);
        expect(layer.sandQ50).toBe(40);
        expect(layer.siltQ50).toBe(35);
        expect(layer.clayQ50).toBe(25);
        expect(layer.confidence).toBe('low');
      }
    },
  );
});
