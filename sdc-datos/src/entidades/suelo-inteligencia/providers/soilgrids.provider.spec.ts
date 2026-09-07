import { SoilTextureClassifier } from '../texture-classifier.service';
import { SoilGridsProvider } from './soilgrids.provider';
import {
  SOILGRIDS_DEPTHS,
  SOILGRIDS_PROPERTIES,
} from '../config/soilgrids.config';

describe('SoilGridsProvider', () => {
  const provider = new SoilGridsProvider(new SoilTextureClassifier());
  const geometry = {
    geometryHash: 'polygon-hash',
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

  it('aplica factores oficiales y no trata enteros escalados como porcentajes', () => {
    expect(420 / SOILGRIDS_PROPERTIES.clay.conversionFactor).toBe(42);
    expect(130 / SOILGRIDS_PROPERTIES.bdod.conversionFactor).toBe(1.3);
    expect(61 / SOILGRIDS_PROPERTIES.phh2o.conversionFactor).toBe(6.1);
  });

  it('calcula estadistica zonal ponderada sobre todas las celdas intersectadas', () => {
    const result = (provider as any).zonalStatistics({
      values: new Int16Array([100, 200, 300, 400]),
      width: 2,
      height: 2,
      bounds: [0, 0, 0.01, 0.01],
      nodata: null,
      geometry,
      conversionFactor: 10,
    });
    expect(result.validPixels).toBe(4);
    expect(result.weightedMean).toBeCloseTo(25, 1);
    expect(result.coveragePercentage).toBeGreaterThan(95);
    expect(result.spatialLow).toBe(10);
    expect(result.spatialHigh).toBe(40);
  });

  it('cierra la composición SoilGrids y conserva la suma observada', () => {
    const result = (provider as any).closeTextureComposition(8, 55, 27.5);
    expect(result.originalSum).toBeCloseTo(90.5, 4);
    expect(result.closureApplied).toBe(true);
    expect(result.sand + result.silt + result.clay).toBeCloseTo(100, 8);
  });

  it('rechaza composiciones SoilGrids con desvíos excesivos', () => {
    expect(() => (provider as any).closeTextureComposition(5, 45, 25)).toThrow(
      /fuera de tolerancia/i,
    );
  });

  it('limita la concurrencia y conserva el orden de los resultados', async () => {
    let active = 0;
    let maximumActive = 0;
    const tasks = [30, 5, 15, 1].map((delay, index) => async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      return index;
    });

    const results = await (provider as any).settledWithLimit(tasks, 2);

    expect(maximumActive).toBe(2);
    expect(results.map((result) => result.value)).toEqual([0, 1, 2, 3]);
  });

  it('usa valores seguros cuando una concurrencia de entorno es inválida', () => {
    const previous = process.env.SOILGRIDS_GLOBAL_CONCURRENCY;
    process.env.SOILGRIDS_GLOBAL_CONCURRENCY = 'no-es-un-numero';
    try {
      expect(
        (provider as any).concurrency('SOILGRIDS_GLOBAL_CONCURRENCY', 10),
      ).toBe(10);
    } finally {
      if (previous === undefined)
        delete process.env.SOILGRIDS_GLOBAL_CONCURRENCY;
      else process.env.SOILGRIDS_GLOBAL_CONCURRENCY = previous;
    }
  });

  describe('profundidades incompletas', () => {
    let previousWcsEnabled: string | undefined;

    beforeEach(() => {
      previousWcsEnabled = process.env.SOILGRIDS_WCS_ENABLED;
      delete process.env.SOILGRIDS_WCS_ENABLED;
    });

    afterEach(() => {
      jest.restoreAllMocks();
      if (previousWcsEnabled === undefined)
        delete process.env.SOILGRIDS_WCS_ENABLED;
      else process.env.SOILGRIDS_WCS_ENABLED = previousWcsEnabled;
    });

    const mockCoverage = (
      assessedProvider: SoilGridsProvider,
      missing: (property: string, depthCode: string, quantile: string) => boolean,
    ) =>
      jest.spyOn(assessedProvider as any, 'readCoverage').mockImplementation(
        async (_geometry, property: string, depthCode: string, quantile: string) => {
          if (missing(property, depthCode, quantile)) {
            throw new Error('Cobertura simulada no disponible.');
          }
          const value = property === 'sand' ? 40 : property === 'silt' ? 35 : 25;
          return {
            weightedMean: value,
            median: value,
            spatialLow: value,
            spatialHigh: value,
            standardDeviation: 0,
            validPixels: 4,
            coveragePercentage: 100,
          };
        },
      );

    it('advierte cada una de las cuatro profundidades sin Q50 y conserva las dos capas válidas', async () => {
      const assessedProvider = new SoilGridsProvider(new SoilTextureClassifier());
      const missingDepths = SOILGRIDS_DEPTHS.slice(0, 4);
      const missingProperties = ['sand', 'silt', 'clay', 'sand'];
      mockCoverage(assessedProvider, (property, depthCode, quantile) => {
        const index = missingDepths.findIndex((depth) => depth.code === depthCode);
        return index >= 0 && property === missingProperties[index] && quantile === 'Q0.5';
      });

      const result = await assessedProvider.assess(geometry);

      expect(result.profile.map((layer) => [layer.depthFromCm, layer.depthToCm]))
        .toEqual([[60, 100], [100, 200]]);
      expect(result.warnings).toEqual(missingDepths.map((depth) =>
        `SoilGrids no pudo completar ${depth.fromCm}–${depth.toCm} cm: faltan datos de textura.`,
      ));
      // 100% del área de esas dos capas no equivale a disponer de seis profundidades.
      expect(result.coveragePercentage).toBe(100);
      expect(result.profile).toHaveLength(2);
      expect(result.confidence).toBe('low');
    });

    it('no descarta una profundidad por faltar solo un cuantil no esencial', async () => {
      const assessedProvider = new SoilGridsProvider(new SoilTextureClassifier());
      mockCoverage(assessedProvider, (property, _depthCode, quantile) =>
        property === 'sand' && quantile === 'Q0.95',
      );

      const result = await assessedProvider.assess(geometry);

      expect(result.profile).toHaveLength(SOILGRIDS_DEPTHS.length);
      expect(result.profile.every((layer) => layer.sandQ95 === undefined)).toBe(true);
      expect(result.warnings).toEqual([]);
      expect(result.coveragePercentage).toBe(100);
    });

    it('informa las seis profundidades faltantes cuando ninguna devuelve textura Q50', async () => {
      const assessedProvider = new SoilGridsProvider(new SoilTextureClassifier());
      mockCoverage(assessedProvider, (property, _depthCode, quantile) =>
        property === 'clay' && quantile === 'Q0.5',
      );

      const result = await assessedProvider.assess(geometry);

      expect(result.profile).toEqual([]);
      expect(result.coveragePercentage).toBe(0);
      expect(result.confidence).toBe('unavailable');
      expect(result.warnings).toEqual([
        ...SOILGRIDS_DEPTHS.map((depth) =>
          `SoilGrids no pudo completar ${depth.fromCm}–${depth.toCm} cm: faltan datos de textura.`,
        ),
        'SoilGrids no devolvió píxeles válidos para el polígono del lote.',
      ]);
    });
  });
});
