import { SoilTextureClassifier } from '../texture-classifier.service';
import { SoilGridsProvider } from './soilgrids.provider';
import { SOILGRIDS_PROPERTIES } from '../config/soilgrids.config';

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
});
