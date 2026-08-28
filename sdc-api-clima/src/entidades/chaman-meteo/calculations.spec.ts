import {
  growingDegreeDayFromHourly,
  hourlyEt0Fao56,
  relativeHumidityFromDewPoint,
  windFromComponents,
  windSpeedAt2m,
} from 'modelos/src';
import {
  resolveChamanMeteoCalculationVersion,
  resolveChamanMeteoHistoricalStart,
  resolveChamanMeteoRuntimeHistoricalStart,
  resolveChamanMeteoRuntimeSourceVersion,
  resolveChamanMeteoRuntimeVersion,
  resolveChamanMeteoSourceVersion,
} from '../../env';

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
    expect(() => resolveChamanMeteoHistoricalStart('2019-12-31')).toThrow(
      'Chaman-Meteo solo admite historicos desde 2020-01-01',
    );
  });

  it('rejects legacy or arbitrary calculation labels for the v2 API', () => {
    expect(resolveChamanMeteoCalculationVersion('chaman-meteo-agro-v2')).toBe(
      'chaman-meteo-agro-v2',
    );
    expect(() =>
      resolveChamanMeteoCalculationVersion('chaman-meteo-agro-v1'),
    ).toThrow(/exactamente chaman-meteo-agro-v2/);
    expect(() => resolveChamanMeteoCalculationVersion('custom-v2')).toThrow(
      /exactamente chaman-meteo-agro-v2/,
    );
    expect(() => resolveChamanMeteoCalculationVersion('')).toThrow(
      /exactamente chaman-meteo-agro-v2/,
    );
    expect(() =>
      resolveChamanMeteoCalculationVersion(' chaman-meteo-agro-v2 '),
    ).toThrow(/exactamente chaman-meteo-agro-v2/);
  });

  it('isolates a legacy runtime label instead of crashing the shared climate API', () => {
    expect(resolveChamanMeteoRuntimeVersion(undefined)).toEqual({
      calculationVersion: 'chaman-meteo-agro-v2',
      configuredVersion: 'chaman-meteo-agro-v2',
      valid: true,
      error: undefined,
    });
    expect(
      resolveChamanMeteoRuntimeVersion('chaman-meteo-agro-v1'),
    ).toEqual({
      calculationVersion: 'chaman-meteo-agro-v2',
      configuredVersion: 'chaman-meteo-agro-v1',
      valid: false,
      error:
        'CHAMAN_METEO_CALCULATION_VERSION debe ser exactamente chaman-meteo-agro-v2',
    });
  });

  it('isolates an out-of-contract historical start from the shared climate API', () => {
    expect(resolveChamanMeteoRuntimeHistoricalStart(undefined)).toEqual({
      historicalStart: '2020-01-01',
      configuredStart: '2020-01-01',
      valid: true,
    });
    expect(resolveChamanMeteoRuntimeHistoricalStart('1950-01-01')).toEqual({
      historicalStart: '2020-01-01',
      configuredStart: '1950-01-01',
      valid: false,
      error: 'Chaman-Meteo solo admite historicos desde 2020-01-01',
    });
  });

  it('isolates a legacy source label from the shared climate API', () => {
    expect(resolveChamanMeteoSourceVersion('era5-land-timeseries-19var-v2')).toBe(
      'era5-land-timeseries-19var-v2',
    );
    expect(() =>
      resolveChamanMeteoSourceVersion('era5-land-timeseries-v1'),
    ).toThrow(/exactamente era5-land-timeseries-19var-v2/);
    expect(resolveChamanMeteoRuntimeSourceVersion(undefined)).toMatchObject({
      sourceVersion: 'era5-land-timeseries-19var-v2',
      valid: true,
    });
    expect(
      resolveChamanMeteoRuntimeSourceVersion('era5-land-timeseries-v1'),
    ).toMatchObject({
      sourceVersion: 'era5-land-timeseries-19var-v2',
      configuredVersion: 'era5-land-timeseries-v1',
      valid: false,
    });
  });
});
