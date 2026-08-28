export const CHAMAN_METEO_CALCULATION_VERSION = "chaman-meteo-agro-v2";
export const CHAMAN_METEO_MIN_HISTORICAL_DATE = "2020-01-01";

export function saturationVapourPressureKpa(temperatureC: number): number {
  if (!Number.isFinite(temperatureC)) return NaN;
  return 0.6108 * Math.exp((17.27 * temperatureC) / (temperatureC + 237.3));
}

export function relativeHumidityFromDewPoint(
  temperatureC: number,
  dewPointC: number,
): number {
  const saturated = saturationVapourPressureKpa(temperatureC);
  const actual = saturationVapourPressureKpa(Math.min(dewPointC, temperatureC));
  if (
    !Number.isFinite(saturated) ||
    saturated <= 0 ||
    !Number.isFinite(actual)
  ) {
    return NaN;
  }
  return Math.min(100, Math.max(0, (100 * actual) / saturated));
}

export function vapourPressureDeficitKpa(
  temperatureC: number,
  dewPointC: number,
): number {
  const saturated = saturationVapourPressureKpa(temperatureC);
  const actual = saturationVapourPressureKpa(Math.min(dewPointC, temperatureC));
  return Math.max(0, saturated - actual);
}

export function windFromComponents(
  uMs: number,
  vMs: number,
): {
  speedMs: number;
  directionDeg: number;
} {
  const speedMs = Math.sqrt(uMs * uMs + vMs * vMs);
  const directionDeg = (Math.atan2(-uMs, -vMs) * 180) / Math.PI;
  return { speedMs, directionDeg: (directionDeg + 360) % 360 };
}

/** FAO-56 logarithmic conversion from the measurement height to 2 m. */
export function windSpeedAt2m(speedMs: number, measuredHeightM = 10): number {
  if (speedMs < 0 || measuredHeightM <= 0) return NaN;
  return speedMs * (4.87 / Math.log(67.8 * measuredHeightM - 5.42));
}

export function growingDegreeHour(
  temperatureC: number,
  baseTemperatureC: number,
  upperTemperatureC?: number,
): number {
  const bounded = Number.isFinite(upperTemperatureC)
    ? Math.min(temperatureC, upperTemperatureC as number)
    : temperatureC;
  return Math.max(0, bounded - baseTemperatureC);
}

export function growingDegreeDayFromHourly(
  temperaturesC: number[],
  baseTemperatureC: number,
  upperTemperatureC?: number,
): number | undefined {
  const values = temperaturesC.filter(Number.isFinite);
  if (!values.length) return undefined;
  return (
    values.reduce(
      (sum, value) =>
        sum + growingDegreeHour(value, baseTemperatureC, upperTemperatureC),
      0,
    ) / 24
  );
}

export interface IHourlyEt0Fao56Params {
  temperatureC: number;
  dewPointC: number;
  surfacePressureKpa: number;
  windSpeed2Ms: number;
  netRadiationMjM2: number;
  soilHeatFluxMjM2?: number;
}

/** FAO-56 hourly Penman-Monteith. Radiation must already be de-accumulated. */
export function hourlyEt0Fao56(params: IHourlyEt0Fao56Params): number {
  const {
    temperatureC,
    dewPointC,
    surfacePressureKpa,
    windSpeed2Ms,
    netRadiationMjM2,
    soilHeatFluxMjM2 = 0,
  } = params;
  const es = saturationVapourPressureKpa(temperatureC);
  const ea = saturationVapourPressureKpa(Math.min(dewPointC, temperatureC));
  const delta =
    (4098 * saturationVapourPressureKpa(temperatureC)) /
    Math.pow(temperatureC + 237.3, 2);
  const gamma = 0.000665 * surfacePressureKpa;
  const numerator =
    0.408 * delta * (netRadiationMjM2 - soilHeatFluxMjM2) +
    gamma * (37 / (temperatureC + 273)) * windSpeed2Ms * (es - ea);
  const denominator = delta + gamma * (1 + 0.34 * windSpeed2Ms);
  return Math.max(0, numerator / denominator);
}
