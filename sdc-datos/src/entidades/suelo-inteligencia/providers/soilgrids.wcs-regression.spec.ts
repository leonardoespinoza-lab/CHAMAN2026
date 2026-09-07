import { area, polygon } from '@turf/turf';
import axios from 'axios';
import { fromArrayBuffer } from 'geotiff';
import { SOILGRIDS_DEPTHS } from '../config/soilgrids.config';
import { SoilTextureClassifier } from '../texture-classifier.service';
import { SoilGridsProvider } from './soilgrids.provider';

jest.mock('geotiff', () => ({ fromArrayBuffer: jest.fn() }));

// Entirely synthetic contract fixtures, not derived from field captures.
// Origin (0,0), 0.01-degree cells and simple invented integers are deliberate.
// No recorded areas, overlap weights, geographic origins or evidence hashes.
const bounds = [0, -0.02, 0.02, 0];
const shape = polygon([[
  [0, -0.02], [0.02, -0.02], [0.02, 0], [0, 0], [0, -0.02],
]]);
const geometry = {
  geometryHash: 'entirely-synthetic-square-at-zero',
  areaM2: area(shape),
  geometry: shape.geometry,
  representativePoint: {
    type: 'Point' as const,
    coordinates: [0.01, -0.01] as [number, number],
  },
  warnings: [],
  swappedCoordinates: false,
};
const syntheticRawQ50: Record<string, number> = {
  sand: 200, silt: 400, clay: 200,
  bdod: 100, cfvo: 100, phh2o: 60, soc: 100,
  nitrogen: 100, cec: 100, wv0033: 300, wv1500: 100,
};
const requestedCoverage = (params: unknown) =>
  String((params as { COVERAGE?: unknown } | undefined)?.COVERAGE);

describe('SoilGrids WCS contract (entirely synthetic, offline)', () => {
  let provider: any;

  beforeEach(() => {
    provider = new SoilGridsProvider(new SoilTextureClassifier());
    (fromArrayBuffer as jest.Mock).mockReset();
  });

  afterEach(() => jest.restoreAllMocks());

  function installSyntheticWcs(nodataIndices: number[] = []) {
    jest.spyOn(provider, 'rasterDimensions').mockReturnValue({ width: 2, height: 2 });
    // All HTTP is mocked. The two bytes carry an invented integer to the
    // mocked TIFF decoder; they are not a real TIFF or a captured response.
    const request = jest.spyOn(axios, 'get').mockImplementation(async (_url, options) => {
      const coverage = requestedCoverage(options?.params);
      const [property, , quantile] = coverage.split('_');
      expect(Object.keys(syntheticRawQ50)).toContain(property);
      expect(['Q0.05', 'Q0.5', 'Q0.95']).toContain(quantile);
      const multiplier = quantile === 'Q0.05' ? 0.5 : quantile === 'Q0.95' ? 1.5 : 1;
      const data = new ArrayBuffer(2);
      new DataView(data).setInt16(0, syntheticRawQ50[property] * multiplier);
      return { data };
    });
    (fromArrayBuffer as jest.Mock).mockImplementation(async (buffer: ArrayBuffer) => {
      const raw = new DataView(buffer).getInt16(0);
      return {
        getImage: async () => ({
          getWidth: () => 2,
          getHeight: () => 2,
          getBoundingBox: () => bounds,
          getGDALNoData: () => -32768,
          getGeoKeys: () => ({
            GeographicTypeGeoKey: 4326,
            GTModelTypeGeoKey: 2,
            GTRasterTypeGeoKey: 1,
          }),
          getFileDirectory: () => ({
            ModelPixelScale: [0.01, 0.01, 0],
            ModelTiepoint: [0, 0, 0, 0, 0, 0],
          }),
          readRasters: async () => [new Int16Array(
            [0, 1, 2, 3].map(index => nodataIndices.includes(index) ? -32768 : raw),
          )],
        }),
      };
    });
    return request;
  }

  it('accepts synthetic WCS metadata and computes spatial support through readCoverage', async () => {
    const request = installSyntheticWcs();
    const result = await provider.readCoverage(geometry, 'sand', '5-15cm', 'Q0.5');

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('/map/sand.map'),
      expect.objectContaining({ params: expect.objectContaining({
        SERVICE: 'WCS', VERSION: '1.0.0', REQUEST: 'GetCoverage',
        COVERAGE: 'sand_5-15cm_Q0.5', CRS: 'EPSG:4326',
        BBOX: bounds.join(','), WIDTH: 2, HEIGHT: 2, FORMAT: 'GEOTIFF_INT16',
      }) }),
    );
    expect(result.weightedMean).toBeCloseTo(20, 8);
    expect(result.validPixels).toBe(4);
    expect(result.coveragePercentage).toBeCloseTo(100, 5);
    expect(result.spatialSupport.gridHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.spatialSupport.validMaskHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('closes an invented marginal Q50 sum of 80 without dropping the horizon or requesting mean', async () => {
    const request = installSyntheticWcs();
    // Do not mock readCoverage: exercise TIFF metadata, scaling, polygon
    // integration and matching support before readDepth closes the texture.
    const layer = await provider.readDepth(geometry, SOILGRIDS_DEPTHS[2]);

    expect(layer).toMatchObject({
      depthFromCm: 15, depthToCm: 30,
      sandQ50: 25, siltQ50: 50, clayQ50: 25,
      textureCompositionOriginalSum: 80,
      textureCompositionClosureApplied: true,
      fieldCapacityPercentage: 30, wiltingPointPercentage: 10,
      availableWaterMmPerMeter: 200, validPixels: 4, confidence: 'low',
    });
    expect(layer.qualityFlags.join(' ')).toMatch(/confianza textural baja/);
    expect(request).toHaveBeenCalledTimes(17);
    expect(request.mock.calls.every(([, options]) =>
      !requestedCoverage(options?.params).endsWith('_mean'),
    )).toBe(true);
  });

  it('retains a valid synthetic horizon when all texture fractions share the same nodata mask', async () => {
    installSyntheticWcs([1, 3]);
    const layer = await provider.readDepth(geometry, SOILGRIDS_DEPTHS[0]);

    expect(layer).toMatchObject({
      depthFromCm: 0, depthToCm: 5,
      sandQ50: 25, siltQ50: 50, clayQ50: 25,
      textureCompositionOriginalSum: 80,
      validPixels: 2, confidence: 'low',
    });
    expect(layer.coveragePercentage).toBeCloseTo(50, 5);
  });
});
