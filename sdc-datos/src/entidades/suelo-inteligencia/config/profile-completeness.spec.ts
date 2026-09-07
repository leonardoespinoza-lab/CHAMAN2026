import {
  hasCompleteSoilInterval,
  mergeSoilGridsProfiles,
  missingSoilGridsDepths,
} from './profile-completeness';
import { SOILGRIDS_DEPTHS } from './soilgrids.config';

const complete = () =>
  SOILGRIDS_DEPTHS.map((depth) => ({
    depthFromCm: depth.fromCm,
    depthToCm: depth.toCm,
    sandQ50: 20,
    siltQ50: 50,
    clayQ50: 30,
    availableWaterMmPerMeter: 175,
  })) as any[];

describe('Soil profile vertical completeness', () => {
  it('accepts six horizons and exact subintervals without mutating input', () => {
    const layers = complete().reverse();
    expect(missingSoilGridsDepths(layers)).toEqual([]);
    expect(hasCompleteSoilInterval(layers, 0, 200)).toBe(true);
    expect(hasCompleteSoilInterval(layers, 10, 85)).toBe(true);
    expect(layers[0].depthFromCm).toBe(100);
  });
  it('detects the four missing horizons in the observed pattern', () => {
    const layers = [complete()[0], complete()[5]];
    expect(missingSoilGridsDepths(layers).map((d) => d.code)).toEqual([
      '5-15cm',
      '15-30cm',
      '30-60cm',
      '60-100cm',
    ]);
    expect(hasCompleteSoilInterval(layers, 0, 5)).toBe(true);
    expect(hasCompleteSoilInterval(layers, 0, 30)).toBe(false);
    expect(
      hasCompleteSoilInterval(
        layers,
        0,
        100,
        (l) => l.availableWaterMmPerMeter,
      ),
    ).toBe(false);
  });
  it.each([null, undefined, NaN, Infinity, '30'])(
    'rejects missing/non-numeric properties %s',
    (value) => {
      const layers = complete();
      layers[1].availableWaterMmPerMeter = value;
      expect(
        hasCompleteSoilInterval(
          layers,
          0,
          30,
          (l) => l.availableWaterMmPerMeter,
        ),
      ).toBe(false);
      layers[1].clayQ50 = value;
      expect(missingSoilGridsDepths(layers).map((d) => d.code)).toContain(
        '5-15cm',
      );
    },
  );
  it('rejects overlaps/duplicates rather than inflating represented thickness', () => {
    const layers = complete();
    layers.push({ ...layers[1] });
    expect(hasCompleteSoilInterval(layers, 0, 30)).toBe(false);
  });
  it('retains old valid horizons when a retry returns only the missing depths', () => {
    const layers = complete();
    const merged = mergeSoilGridsProfiles(
      [layers[0], layers[5]],
      layers.slice(1, 5),
    );
    expect(merged).toEqual(layers);
    expect(missingSoilGridsDepths(merged)).toEqual([]);
  });
  it('does not retain invalid horizons or mix properties of a fresh horizon', () => {
    const old = complete();
    const fresh = [{ ...old[0], availableWaterMmPerMeter: undefined }];
    old[1].clayQ50 = null;
    const result = mergeSoilGridsProfiles(old, fresh);
    expect(result[0].availableWaterMmPerMeter).toBeUndefined();
    expect(missingSoilGridsDepths(result).map((d) => d.code)).toEqual([
      '5-15cm',
    ]);
  });
});
