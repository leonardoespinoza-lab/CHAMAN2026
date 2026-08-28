import {
  IChamanMeteoDaily,
  IChamanMeteoHourlyDerived,
} from 'modelos/src';

export type ChamanMeteoPoint = [number, number | null];

export const CHAMAN_METEO_HOURLY_CSV_HEADERS = [
  'gridPointKey', 'timestampUtc', 'calculationVersion', 'calculatedAt',
  'temperatureC', 'dewPointC', 'relativeHumidityPct', 'surfacePressureKpa',
  'windU10Ms', 'windV10Ms', 'windSpeed10Ms', 'windSpeed2Ms', 'windDirectionDeg',
  'precipitationMm', 'shortwaveRadiationMjM2', 'thermalRadiationMjM2',
  'netRadiationMjM2', 'vpdKpa', 'et0Mm', 'skinTemperatureC', 'snowCoverPct',
  'snowDepthM', 'soilTemperatureC_0_7cm', 'soilTemperatureC_7_28cm',
  'soilTemperatureC_28_100cm', 'soilTemperatureC_100_289cm',
  'soilWaterM3M3_0_7cm', 'soilWaterM3M3_7_28cm', 'soilWaterM3M3_28_100cm',
  'soilWaterM3M3_100_289cm', 'qualityFlags',
] as const;

export const CHAMAN_METEO_DAILY_CSV_HEADERS = [
  'gridPointKey', 'date', 'timezone', 'calculationVersion', 'calculatedAt',
  'hoursAvailable', 'hoursExpected', 'temperatureMinC', 'temperatureMeanC',
  'temperatureMaxC', 'relativeHumidityMinPct', 'relativeHumidityMeanPct',
  'relativeHumidityMaxPct', 'dewPointMinC', 'dewPointMeanC', 'dewPointMaxC',
  'surfacePressureMinKpa', 'surfacePressureMeanKpa', 'surfacePressureMaxKpa',
  'precipitationMm', 'precipitationMaxHourlyMm', 'windSpeedMeanMs_legacy', 'windSpeedMaxMs_legacy',
  'windSpeed2mMeanMs', 'windSpeed2mMaxMs', 'windSpeed10mMeanMs',
  'windSpeed10mMaxMs', 'windDirectionDominantDeg', 'windDirectionResultantRatio',
  'shortwaveRadiationMjM2', 'thermalRadiationMjM2', 'netRadiationMjM2', 'et0Mm',
  'vpdMinKpa', 'vpdMeanKpa', 'vpdMaxKpa', 'skinTemperatureMinC',
  'skinTemperatureMeanC', 'skinTemperatureMaxC', 'snowCoverMinPct',
  'snowCoverMeanPct', 'snowCoverMaxPct', 'snowDepthMinM', 'snowDepthMeanM',
  'snowDepthMaxM', 'soilTemperatureMinC_0_7cm', 'soilTemperatureMinC_7_28cm',
  'soilTemperatureMinC_28_100cm', 'soilTemperatureMinC_100_289cm',
  'soilTemperatureMeanC_0_7cm', 'soilTemperatureMeanC_7_28cm',
  'soilTemperatureMeanC_28_100cm', 'soilTemperatureMeanC_100_289cm',
  'soilTemperatureMaxC_0_7cm', 'soilTemperatureMaxC_7_28cm',
  'soilTemperatureMaxC_28_100cm', 'soilTemperatureMaxC_100_289cm',
  'soilWaterMinM3M3_0_7cm', 'soilWaterMinM3M3_7_28cm',
  'soilWaterMinM3M3_28_100cm', 'soilWaterMinM3M3_100_289cm',
  'soilWaterMeanM3M3_0_7cm', 'soilWaterMeanM3M3_7_28cm',
  'soilWaterMeanM3M3_28_100cm', 'soilWaterMeanM3M3_100_289cm',
  'soilWaterMaxM3M3_0_7cm', 'soilWaterMaxM3M3_7_28cm',
  'soilWaterMaxM3M3_28_100cm', 'soilWaterMaxM3M3_100_289cm',
  'availableHours_temperature', 'availableHours_dewPoint',
  'availableHours_relativeHumidity', 'availableHours_surfacePressure',
  'availableHours_wind10m', 'availableHours_wind2m',
  'availableHours_windDirection', 'availableHours_precipitation',
  'availableHours_shortwaveRadiation', 'availableHours_thermalRadiation',
  'availableHours_netRadiation', 'availableHours_vpd', 'availableHours_et0',
  'availableHours_skinTemperature', 'availableHours_snowCover',
  'availableHours_snowDepth', 'availableHours_soilTemperature_0_7cm',
  'availableHours_soilTemperature_7_28cm',
  'availableHours_soilTemperature_28_100cm',
  'availableHours_soilTemperature_100_289cm', 'availableHours_soilWater_0_7cm',
  'availableHours_soilWater_7_28cm', 'availableHours_soilWater_28_100cm',
  'availableHours_soilWater_100_289cm', 'qualityFlags',
] as const;

export function chronological<T>(rows: T[], timestamp: (row: T) => string): T[] {
  return [...rows].sort((left, right) => dateValue(timestamp(left)) - dateValue(timestamp(right)));
}

export function seriesWithGaps<T>(
  rows: T[],
  timestamp: (row: T) => string,
  value: (row: T) => number | null | undefined,
  expectedStepMs: number,
  alreadyChronological = false,
): ChamanMeteoPoint[] {
  const sorted = alreadyChronological ? rows : chronological(rows, timestamp);
  const points: ChamanMeteoPoint[] = [];
  let previousTime: number | undefined;

  for (const row of sorted) {
    const time = dateValue(timestamp(row));
    if (!Number.isFinite(time)) continue;
    if (previousTime !== undefined && time - previousTime > expectedStepMs * 1.5) {
      points.push([previousTime + expectedStepMs, null]);
    }
    const metric = value(row);
    points.push([time, finite(metric) ? Number(metric) : null]);
    previousTime = time;
  }

  return points;
}

export function mapUniqueByKey<T, V>(
  rows: T[],
  key: (row: T) => string,
  resolve: (row: T) => V,
): Map<string, V> {
  const values = new Map<string, V>();
  for (const row of rows) {
    const rowKey = key(row);
    if (!values.has(rowKey)) values.set(rowKey, resolve(row));
  }
  return values;
}

export function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function compassDirection(value?: number): string {
  if (!finite(value)) return '-';
  const labels = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  const normalized = ((value % 360) + 360) % 360;
  return labels[Math.round(normalized / 22.5) % labels.length];
}

export function layerValue(values: Array<number | null> | undefined, index: number): number | undefined {
  const value = values?.[index];
  return finite(value) ? value : undefined;
}

export function tailRows<T>(rows: T[], maximumRows: number): T[] {
  const limit = Math.max(0, Math.floor(maximumRows));
  if (limit === 0) return [];
  return rows.length <= limit ? [...rows] : rows.slice(rows.length - limit);
}

export function dominantWindDirectionLabel(
  direction?: number,
  resultantRatio?: number,
  meanSpeed?: number,
  minimumResultantRatio = 0.1,
): string {
  if (!finite(meanSpeed) || meanSpeed <= 0.1 || !finite(direction)) return 'Sin dirección dominante';
  if (!finite(resultantRatio) || resultantRatio <= minimumResultantRatio) return 'Variable';
  return `${compassDirection(direction)} ${Number(direction).toFixed(0)}°`;
}

export function localMidnightUtc(dateText: string, timeZone = 'UTC'): string {
  if (!validCalendarDate(dateText)) throw new Error('Fecha local inválida.');
  const target = Date.parse(`${dateText}T00:00:00.000Z`);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const localDate = (instant: number): string => {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
    );
    return `${parts['year']}-${parts['month']}-${parts['day']}`;
  };

  // A civil day always has a first representable instant, even when a DST
  // transition skips 00:00. Find that boundary directly instead of iterating
  // offsets, which can oscillate between both sides of the transition.
  const searchRadiusMs = 36 * 60 * 60 * 1000;
  let before = target - searchRadiusMs;
  let atOrAfter = target + searchRadiusMs;
  if (localDate(before) >= dateText || localDate(atOrAfter) < dateText) {
    throw new Error('No se pudo resolver la fecha en la zona horaria.');
  }
  while (atOrAfter - before > 1) {
    const candidate = before + Math.floor((atOrAfter - before) / 2);
    if (localDate(candidate) < dateText) before = candidate;
    else atOrAfter = candidate;
  }
  if (localDate(atOrAfter) !== dateText) {
    throw new Error('No se pudo resolver la fecha en la zona horaria.');
  }
  return new Date(atOrAfter).toISOString();
}

export function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function localDateAtInstant(value: string | Date, timeZone = 'UTC'): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('Instante inválido.');
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(parsed).map((part) => [part.type, part.value]),
  );
  return `${parts['year']}-${parts['month']}-${parts['day']}`;
}

export function localDatesTouched(
  from: string,
  toExclusive: string,
  timeZone = 'UTC',
): { from: string; toExclusive: string } {
  const start = new Date(from);
  const end = new Date(toExclusive);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new Error('Rango temporal inválido.');
  }
  const firstDate = localDateAtInstant(start, timeZone);
  const lastDate = localDateAtInstant(new Date(end.getTime() - 1), timeZone);
  return { from: firstDate, toExclusive: addCalendarDays(lastDate, 1) };
}

export function buildHourlyCsvRows(rows: IChamanMeteoHourlyDerived[]): unknown[][] {
  return [[...CHAMAN_METEO_HOURLY_CSV_HEADERS], ...rows.map((row) => [
    row.gridPointKey, row.timestamp, row.calculationVersion, row.calculatedAt,
    row.values.temperatureC, row.values.dewPointC, row.values.relativeHumidityPct,
    row.values.surfacePressureKpa, row.values.windU10Ms, row.values.windV10Ms,
    row.values.windSpeed10Ms, row.values.windSpeed2Ms, row.values.windDirectionDeg,
    row.values.precipitationMm, row.values.shortwaveRadiationMjM2,
    row.values.thermalRadiationMjM2, row.values.netRadiationMjM2, row.values.vpdKpa,
    row.values.et0Mm, row.values.skinTemperatureC, row.values.snowCoverPct,
    row.values.snowDepthM, ...fourLayers(row.values.soilTemperatureC),
    ...fourLayers(row.values.soilWaterM3M3), row.qualityFlags,
  ])];
}

export function buildDailyCsvRows(rows: IChamanMeteoDaily[]): unknown[][] {
  return [[...CHAMAN_METEO_DAILY_CSV_HEADERS], ...rows.map((row) => {
    const values = row.values;
    const availability = row.availableHoursByMetric;
    return [
      row.gridPointKey, row.date, row.timezone, row.calculationVersion, row.calculatedAt,
      row.hoursAvailable, row.hoursExpected, values.temperatureMinC,
      values.temperatureMeanC, values.temperatureMaxC, values.relativeHumidityMinPct,
      values.relativeHumidityMeanPct, values.relativeHumidityMaxPct, values.dewPointMinC,
      values.dewPointMeanC, values.dewPointMaxC, values.surfacePressureMinKpa,
      values.surfacePressureMeanKpa, values.surfacePressureMaxKpa, values.precipitationMm,
      values.precipitationMaxHourlyMm,
      values.windSpeedMeanMs, values.windSpeedMaxMs, values.windSpeed2mMeanMs,
      values.windSpeed2mMaxMs, values.windSpeed10mMeanMs, values.windSpeed10mMaxMs,
      values.windDirectionDominantDeg, values.windDirectionResultantRatio,
      values.shortwaveRadiationMjM2, values.thermalRadiationMjM2,
      values.netRadiationMjM2, values.et0Mm, values.vpdMinKpa, values.vpdMeanKpa,
      values.vpdMaxKpa, values.skinTemperatureMinC, values.skinTemperatureMeanC,
      values.skinTemperatureMaxC, values.snowCoverMinPct, values.snowCoverMeanPct,
      values.snowCoverMaxPct, values.snowDepthMinM, values.snowDepthMeanM,
      values.snowDepthMaxM, ...fourLayers(values.soilTemperatureMinC),
      ...fourLayers(values.soilTemperatureMeanC), ...fourLayers(values.soilTemperatureMaxC),
      ...fourLayers(values.soilWaterMinM3M3), ...fourLayers(values.soilWaterMeanM3M3),
      ...fourLayers(values.soilWaterMaxM3M3), availability?.temperature,
      availability?.dewPoint, availability?.relativeHumidity, availability?.surfacePressure,
      availability?.wind10m, availability?.wind2m, availability?.windDirection,
      availability?.precipitation, availability?.shortwaveRadiation,
      availability?.thermalRadiation, availability?.netRadiation, availability?.vpd,
      availability?.et0, availability?.skinTemperature, availability?.snowCover,
      availability?.snowDepth, ...fourLayers(availability?.soilTemperature),
      ...fourLayers(availability?.soilWater), row.qualityFlags,
    ];
  })];
}

export function csvCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = Array.isArray(value) ? value.join('|') : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function dateValue(value: string): number {
  const parsed = new Date(value);
  return parsed.getTime();
}

function addCalendarDays(dateText: string, days: number): string {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function fourLayers(values: Array<number | null> | undefined): Array<number | null | undefined> {
  return [values?.[0], values?.[1], values?.[2], values?.[3]];
}
