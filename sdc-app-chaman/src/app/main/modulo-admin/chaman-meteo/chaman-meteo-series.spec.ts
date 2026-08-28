import {
  CHAMAN_METEO_DAILY_CSV_HEADERS,
  CHAMAN_METEO_HOURLY_CSV_HEADERS,
  buildDailyCsvRows,
  buildHourlyCsvRows,
  chronological,
  compassDirection,
  csvCell,
  dominantWindDirectionLabel,
  layerValue,
  localDateAtInstant,
  localDatesTouched,
  localMidnightUtc,
  mapUniqueByKey,
  seriesWithGaps,
  tailRows,
  validCalendarDate,
} from './chaman-meteo-series';

describe('Chaman-Meteo historical series', () => {
  it('orders descending API rows and preserves exact values', () => {
    const rows = [
      { timestamp: '2026-08-20T02:00:00Z', value: 12.25 },
      { timestamp: '2026-08-20T01:00:00Z', value: 11.75 },
    ];
    expect(chronological(rows, (row) => row.timestamp).map((row) => row.value)).toEqual([11.75, 12.25]);
    expect(seriesWithGaps(rows, (row) => row.timestamp, (row) => row.value, 3_600_000)).toEqual([
      [Date.parse('2026-08-20T01:00:00Z'), 11.75],
      [Date.parse('2026-08-20T02:00:00Z'), 12.25],
    ]);
  });

  it('inserts a null point instead of joining a transmission gap', () => {
    const rows = [
      { timestamp: '2026-08-20T01:00:00Z', value: 11 },
      { timestamp: '2026-08-20T04:00:00Z', value: 14 },
    ];
    const points = seriesWithGaps(rows, (row) => row.timestamp, (row) => row.value, 3_600_000);
    expect(points).toEqual([
      [Date.parse('2026-08-20T01:00:00Z'), 11],
      [Date.parse('2026-08-20T02:00:00Z'), null],
      [Date.parse('2026-08-20T04:00:00Z'), 14],
    ]);
  });

  it('resolves each unique civil date only once for reusable chart timestamps', () => {
    const rows = [
      { date: '2026-08-20' },
      { date: '2026-08-20' },
      { date: '2026-08-21' },
    ];
    const resolve = jasmine.createSpy('resolve').and.callFake((row: { date: string }) => `${row.date}T03:00:00.000Z`);

    const values = mapUniqueByKey(rows, (row) => row.date, resolve);

    expect(resolve).toHaveBeenCalledTimes(2);
    expect(values.get('2026-08-20')).toBe('2026-08-20T03:00:00.000Z');
    expect(values.get('2026-08-21')).toBe('2026-08-21T03:00:00.000Z');
  });

  it('distinguishes a real zero from missing soil data', () => {
    expect(layerValue([0, null, 0.2], 0)).toBe(0);
    expect(layerValue([0, null, 0.2], 1)).toBeUndefined();
  });

  it('formats meteorological direction around north without a false 180 degree jump', () => {
    expect(compassDirection(359)).toBe('N');
    expect(compassDirection(1)).toBe('N');
    expect(compassDirection(90)).toBe('E');
  });

  it('escapes CSV text and neutralizes spreadsheet formulas', () => {
    expect(csvCell('dato "auditado"')).toBe('"dato ""auditado"""');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell(-2.5)).toBe('-2.5');
  });

  it('converts regular grid-local midnight to UTC', () => {
    expect(localMidnightUtc('2026-08-20', 'America/Argentina/Buenos_Aires')).toBe('2026-08-20T03:00:00.000Z');
    expect(localMidnightUtc('2026-04-04', 'America/Santiago')).toBe('2026-04-04T03:00:00.000Z');
  });

  it('uses the first representable instant during Santiago spring-forward', () => {
    expect(localMidnightUtc('2026-09-06', 'America/Santiago')).toBe('2026-09-06T04:00:00.000Z');
    expect(localDateAtInstant('2026-09-06T04:00:00.000Z', 'America/Santiago')).toBe('2026-09-06');
  });

  it('resolves Santiago fall-back without choosing the repeated prior date', () => {
    expect(localMidnightUtc('2026-04-05', 'America/Santiago')).toBe('2026-04-05T04:00:00.000Z');
    expect(localDateAtInstant('2026-04-05T03:59:59.999Z', 'America/Santiago')).toBe('2026-04-04');
    expect(localDateAtInstant('2026-04-05T04:00:00.000Z', 'America/Santiago')).toBe('2026-04-05');
  });

  it('rejects normalized but impossible calendar dates', () => {
    expect(validCalendarDate('2026-02-28')).toBeTrue();
    expect(validCalendarDate('2026-02-30')).toBeFalse();
  });

  it('includes every local date touched by a half-open 24-hour interval', () => {
    expect(localDateAtInstant('2026-08-20T00:00:00.000Z', 'America/Argentina/Buenos_Aires')).toBe('2026-08-19');
    expect(localDatesTouched(
      '2026-08-20T00:00:00.000Z',
      '2026-08-21T00:00:00.000Z',
      'America/Argentina/Buenos_Aires',
    )).toEqual({ from: '2026-08-19', toExclusive: '2026-08-21' });
  });

  it('limits only chart rows and keeps the newest exact observations', () => {
    const rows = [1, 2, 3, 4, 5];
    expect(tailRows(rows, 3)).toEqual([3, 4, 5]);
    expect(rows).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not claim a dominant wind direction for calm or variable days', () => {
    expect(dominantWindDirectionLabel(270, 0.8, 0)).toBe('Sin dirección dominante');
    expect(dominantWindDirectionLabel(270, 0.05, 4)).toBe('Variable');
    expect(dominantWindDirectionLabel(270, 0.1, 4)).toBe('Variable');
    expect(dominantWindDirectionLabel(270, 0.8, 4)).toBe('O 270°');
  });

  it('exports stable complete hourly and daily contracts without losing zeros or layers', () => {
    const hourlyRows = buildHourlyCsvRows([{
      gridPointKey: 'AR_-38_-68',
      timestamp: '2026-08-20T00:00:00.000Z',
      calculationVersion: 'v2',
      calculatedAt: '2026-08-21T00:00:00.000Z',
      values: {
        windU10Ms: 0,
        soilTemperatureC: [10, 11, 12, 13],
        soilWaterM3M3: [0, 0.1, null, 0.3],
      },
      qualityFlags: ['trace'],
    } as any]);
    const dailyRows = buildDailyCsvRows([{
      gridPointKey: 'AR_-38_-68',
      date: '2026-08-20',
      timezone: 'America/Argentina/Buenos_Aires',
      calculationVersion: 'v2',
      calculatedAt: '2026-08-21T00:00:00.000Z',
      hoursAvailable: 24,
      hoursExpected: 24,
      values: {
        precipitationMm: 0,
        precipitationMaxHourlyMm: 1.25,
        soilTemperatureMeanC: [10, 11, 12, 13],
        soilWaterMeanM3M3: [0, 0.1, null, 0.3],
      },
      availableHoursByMetric: { precipitation: 24, soilWater: [24, 24, 0, 24] },
      qualityFlags: ['daily_contains_precipitation_negative_correction'],
    } as any]);

    expect(new Set(CHAMAN_METEO_HOURLY_CSV_HEADERS).size).toBe(CHAMAN_METEO_HOURLY_CSV_HEADERS.length);
    expect(new Set(CHAMAN_METEO_DAILY_CSV_HEADERS).size).toBe(CHAMAN_METEO_DAILY_CSV_HEADERS.length);
    expect(hourlyRows[1].length).toBe(CHAMAN_METEO_HOURLY_CSV_HEADERS.length);
    expect(dailyRows[1].length).toBe(CHAMAN_METEO_DAILY_CSV_HEADERS.length);
    expect(hourlyRows[1][CHAMAN_METEO_HOURLY_CSV_HEADERS.indexOf('windU10Ms')]).toBe(0);
    expect(dailyRows[1][CHAMAN_METEO_DAILY_CSV_HEADERS.indexOf('precipitationMm')]).toBe(0);
    expect(
      dailyRows[1][CHAMAN_METEO_DAILY_CSV_HEADERS.indexOf('precipitationMaxHourlyMm')]
    ).toBe(1.25);
    expect(dailyRows[1][CHAMAN_METEO_DAILY_CSV_HEADERS.indexOf('soilWaterMeanM3M3_28_100cm')]).toBeNull();
    expect(csvCell(dailyRows[1][CHAMAN_METEO_DAILY_CSV_HEADERS.indexOf('qualityFlags')])).toContain('negative_correction');
  });
});
