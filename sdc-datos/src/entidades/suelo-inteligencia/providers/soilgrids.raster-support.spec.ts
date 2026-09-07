import axios from 'axios';
import { fromArrayBuffer } from 'geotiff';
import { SoilTextureClassifier } from '../texture-classifier.service';
import { SoilGridsProvider } from './soilgrids.provider';

jest.mock('geotiff', () => ({ fromArrayBuffer: jest.fn() }));

describe('SoilGrids raster support (synthetic fixtures, offline)', () => {
  const geometry = {
    geometryHash: 'synthetic-square',
    areaM2: 1_236_434,
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
  const grid = {
    width: 2,
    height: 2,
    bounds: [0, 0, 0.01, 0.01],
    nodata: -32768,
    geometry,
    conversionFactor: 10,
    valueRange: [0, 100],
  };
  let provider: any;

  beforeEach(() => {
    provider = new SoilGridsProvider(new SoilTextureClassifier());
  });
  afterEach(() => jest.restoreAllMocks());

  it('same count and coverage do not hide different valid pixel positions', () => {
    const left = provider.zonalStatistics({
      ...grid,
      values: new Int16Array([100, -32768, 200, -32768]),
    });
    const right = provider.zonalStatistics({
      ...grid,
      values: new Int16Array([-32768, 100, -32768, 200]),
    });
    expect(left.validPixels).toBe(right.validPixels);
    expect(left.coveragePercentage).toBeCloseTo(right.coveragePercentage, 8);
    expect(left.spatialSupport.gridHash).toBe(right.spatialSupport.gridHash);
    expect(left.spatialSupport.validMaskHash).not.toBe(
      right.spatialSupport.validMaskHash,
    );
    expect(() =>
      provider.assertCommonTextureSupport([left, right, left]),
    ).toThrow(/soporte espacial/i);
  });

  it('detects shifted grids even with identical dimensions and valid pixels', () => {
    const left = provider.zonalStatistics({
      ...grid,
      values: new Int16Array([100, 100, 100, 100]),
    });
    const right = provider.zonalStatistics({
      ...grid,
      bounds: [0.0001, 0, 0.0101, 0.01],
      values: new Int16Array([100, 100, 100, 100]),
    });
    expect(left.validPixels).toBe(right.validPixels);
    expect(left.spatialSupport.gridHash).not.toBe(
      right.spatialSupport.gridHash,
    );
    expect(() =>
      provider.assertCommonTextureSupport([left, right, left]),
    ).toThrow(/grilla/i);
  });

  it('keeps real zero and excludes only declared nodata', () => {
    const result = provider.zonalStatistics({
      ...grid,
      values: new Int16Array([0, 200, -32768, 200]),
    });
    expect(result.validPixels).toBe(3);
    expect(result.spatialLow).toBe(0);
    expect(result.weightedMean).toBeCloseTo(40 / 3, 5);
    const copy = provider.zonalStatistics({
      ...grid,
      values: new Int16Array([0, 500, -32768, 500]),
    });
    expect(copy.spatialSupport).toEqual(result.spatialSupport);
    expect(() =>
      provider.assertCommonTextureSupport([result, copy, result]),
    ).not.toThrow();
  });

  it.each([NaN, Infinity, null, undefined, '200', -1, 1001])(
    'rejects invalid overlapped raw pixel %p instead of averaging it away',
    (bad) => {
      expect(() =>
        provider.zonalStatistics({ ...grid, values: [bad, 200, 300, 400] }),
      ).toThrow(/píxel/i);
    },
  );

  it('does not treat an all-nodata raster as zero texture', () => {
    expect(() =>
      provider.zonalStatistics({
        ...grid,
        values: new Int16Array(4).fill(-32768),
      }),
    ).toThrow(/sin píxeles/i);
  });

  it.each([
    { bounds: [0, 0, 0, 0.01] },
    { width: 3 },
    { width: 0 },
    { height: 2.5 },
    { bounds: [0, 0, Infinity, 1] },
    { conversionFactor: 0 },
  ])('rejects inconsistent grid metadata %p', (change) => {
    expect(() =>
      provider.zonalStatistics({
        ...grid,
        ...change,
        values: new Int16Array(4).fill(200),
      }),
    ).toThrow(/metadatos/i);
  });

  function mockImage(change: Record<string, unknown> = {}) {
    jest
      .spyOn(provider, 'rasterDimensions')
      .mockReturnValue({ width: 2, height: 2 });
    const image = {
      getWidth: () => 2,
      getHeight: () => 2,
      getBoundingBox: () => grid.bounds,
      getGDALNoData: () => -32768,
      getGeoKeys: () => ({
        GeographicTypeGeoKey: 4326,
        GTModelTypeGeoKey: 2,
        GTRasterTypeGeoKey: 1,
      }),
      getResolution: () => [0.005, -0.005, 0],
      getFileDirectory: () => ({
        ModelPixelScale: [0.005, 0.005, 0],
        ModelTiepoint: [0, 0, 0, 0, 0.01, 0],
      }),
      readRasters: jest
        .fn()
        .mockResolvedValue([new Int16Array([100, 200, 300, 400])]),
      ...change,
    };
    (fromArrayBuffer as jest.Mock).mockResolvedValue({
      getImage: async () => image,
    });
    jest.spyOn(axios, 'get').mockResolvedValue({ data: new ArrayBuffer(8) });
    return image;
  }

  it('attaches spatial evidence and caches without mixing quantiles/geometries', async () => {
    mockImage();
    const first = await provider.readCoverage(
      geometry,
      'sand',
      '5-15cm',
      'Q0.5',
    );
    expect(first.spatialSupport.gridHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.spatialSupport.validMaskHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      await provider.readCoverage(geometry, 'sand', '5-15cm', 'Q0.5'),
    ).toEqual(first);
    expect(axios.get).toHaveBeenCalledTimes(1);
    await provider.readCoverage(geometry, 'sand', '5-15cm', 'Q0.95');
    await provider.readCoverage(
      { ...geometry, geometryHash: 'second' },
      'sand',
      '5-15cm',
      'Q0.5',
    );
    expect(axios.get).toHaveBeenCalledTimes(3);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/map/sand.map'),
      expect.objectContaining({
        params: expect.objectContaining({
          COVERAGE: 'sand_5-15cm_Q0.5',
          CRS: 'EPSG:4326',
          WIDTH: 2,
          HEIGHT: 2,
        }),
      }),
    );
  });

  it.each([
    {
      getGeoKeys: () => ({
        GeographicTypeGeoKey: 4326,
        GTModelTypeGeoKey: 1,
        GTRasterTypeGeoKey: 1,
        ProjectedCSTypeGeoKey: 3857,
      }),
    },
    {
      getGeoKeys: () => ({
        GeographicTypeGeoKey: 4326,
        GTModelTypeGeoKey: 2,
        GTRasterTypeGeoKey: 2,
      }),
    },
    { getGeoKeys: () => ({}) },
    {
      getFileDirectory: () => ({
        ModelPixelScale: [-0.005, 0.005, 0],
        ModelTiepoint: [0, 0, 0, 0, 0.01, 0],
      }),
    },
    {
      getFileDirectory: () => ({
        ModelPixelScale: [0.005, -0.005, 0],
        ModelTiepoint: [0, 0, 0, 0, 0.01, 0],
      }),
    },
    {
      getFileDirectory: () => ({
        ModelTransformation: [
          0.005, 0, 0, 0, 0, 0.005, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
        ],
      }),
    },
    { getFileDirectory: () => ({}) },
    {
      getFileDirectory: () => ({
        ModelTransformation: [0.005, 0.001, 0, 0, 0, -0.005],
      }),
    },
    { getWidth: () => 3 },
  ])(
    'rejects incompatible WCS metadata without caching it: %p',
    async (change) => {
      mockImage(change);
      await expect(
        provider.readCoverage(geometry, 'sand', '5-15cm', 'Q0.5'),
      ).rejects.toThrow(/grilla/i);
      expect(provider.cache.size).toBe(0);
    },
  );

  it('accepts north-up ModelTransformation without trusting getResolution sign', async () => {
    mockImage({
      getFileDirectory: () => ({
        ModelTransformation: [
          0.005, 0, 0, 0, 0, -0.005, 0, 0.01, 0, 0, 1, 0, 0, 0, 0, 1,
        ],
      }),
      getResolution: () => [0.005, 0.005, 1],
    });
    await expect(
      provider.readCoverage(geometry, 'sand', '5-15cm', 'Q0.5'),
    ).resolves.toMatchObject({ validPixels: 4 });
  });

  it('rejects simultaneous matrix and pixel-scale representations', async () => {
    mockImage({
      getFileDirectory: () => ({
        ModelPixelScale: [0.005, 0.005, 0],
        ModelTiepoint: [0, 0, 0, 0, 0.01, 0],
        ModelTransformation: [
          0.005, 0, 0, 0, 0, -0.005, 0, 0.01, 0, 0, 1, 0, 0, 0, 0, 1,
        ],
      }),
    });
    await expect(
      provider.readCoverage(geometry, 'sand', '5-15cm', 'Q0.5'),
    ).rejects.toThrow(/grilla/i);
  });

  it('recognizes explicitly declared NaN nodata without accepting undeclared NaN', () => {
    const data = {
      ...grid,
      nodata: NaN,
      values: new Float32Array([NaN, 200, 300, 400]),
    };
    expect(provider.zonalStatistics(data).validPixels).toBe(3);
    expect(() => provider.zonalStatistics({ ...data, nodata: null })).toThrow(
      /píxel/i,
    );
  });

  it('does not reject invalid pixels wholly outside the lot', () => {
    const halfGeometry = {
      ...geometry,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0.005, 0],
            [0.005, 0.01],
            [0, 0.01],
            [0, 0],
          ],
        ],
      },
    };
    const result = provider.zonalStatistics({
      ...grid,
      geometry: halfGeometry,
      values: [200, NaN, 400, -2],
    });
    expect(result.validPixels).toBe(2);
    expect(result.weightedMean).toBeCloseTo(30, 5);
  });
});
