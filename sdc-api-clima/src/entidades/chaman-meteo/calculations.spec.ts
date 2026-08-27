import {
  growingDegreeDayFromHourly,
  hourlyEt0Fao56,
  relativeHumidityFromDewPoint,
  windFromComponents,
  windSpeedAt2m,
} from 'modelos/src';
import { resolveChamanMeteoHistoricalStart } from '../../env';

describe('Chaman-Meteo agronomic calculations', () => {
  it('derives relative humidity from temperature and dew point', () => {
    expect(relativeHumidityFromDewPoint(20, 10)).toBeCloseTo(52.5, 1);
    expect(relativeHumidityFromDewPoint(10, 12)).toBe(100);
  });

  it('derives wind speed and meteorological direction from ERA5 components', () => {
    expect(windFromComponents(0, -5)).toEqual({ speedMs: 5, directionDeg: 0 });
    expect(windSpeedAt2m(5)).toBeCloseTo(3.74, 1);
  });

  it('calculates hourly degree accumulation without converting it to a cell-global crop result', () => {
    expect(growingDegreeDayFromHourly(Array(24).fill(20), 10, 30)).toBe(10);
  });

  it('returns a finite non-negative FAO-56 hourly ET0', () => {
    const result = hourlyEt0Fao56({
      temperatureC: 25,
      dewPointC: 15,
      surfacePressureKpa: 101.3,
      windSpeed2Ms: 2,
      netRadiationMjM2: 1.5,
    });
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('accepts only valid historical dates', () => {
    expect(resolveChamanMeteoHistoricalStart('2020-01-01')).toBe('2020-01-01');
    expect(() => resolveChamanMeteoHistoricalStart('2026-02-30')).toThrow();
  });
});
