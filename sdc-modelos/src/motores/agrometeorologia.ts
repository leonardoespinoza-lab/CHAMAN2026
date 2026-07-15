import {
  Cultivo,
  IParametrosAgrometeorologicos,
  IValoresMeteorologicosNormalizados,
  VariableMeteorologicaNormalizada,
} from "../entidades";

export const AGROMET_ENGINE_VERSION = "agromet-1.1.1";
export const AGROMET_DEFAULT_PARAMETERS_VERSION = "agromet-reference-2026.07.2";

export interface ICalculoGddParams {
  temperatureMinC?: number;
  temperatureMaxC?: number;
  baseTemperatureC?: number;
  upperTemperatureC?: number;
}

export interface ICalculoEt0Fao56Params {
  temperatureMinC?: number;
  temperatureMaxC?: number;
  temperatureMeanC?: number;
  relativeHumidityMinPct?: number;
  relativeHumidityMaxPct?: number;
  relativeHumidityMeanPct?: number;
  windSpeedMs?: number;
  windMeasurementHeightM?: number;
  solarRadiationMjM2?: number;
  latitude?: number;
  elevationM?: number;
  dayOfYear?: number;
}

export interface IBalanceHidricoParams {
  previousStorageMm?: number;
  availableWaterCapacityMm?: number;
  precipitationMm?: number;
  irrigationMm?: number;
  etcMm?: number;
  effectiveRainCoefficient?: number;
  runoffCoefficient?: number;
  drainageCoefficient?: number;
}

export interface IResultadoBalanceHidrico {
  effectivePrecipitationMm?: number;
  runoffMm?: number;
  deepDrainageMm?: number;
  storageMm?: number;
  availableWaterPercentage?: number;
  waterDeficitMm?: number;
  waterStressIndex?: number;
  estimated: boolean;
}

export interface ILeafWetnessHour {
  temperatureC?: number;
  relativeHumidityPct?: number;
  dewPointC?: number;
  precipitationMm?: number;
}

export interface ILeafWetnessResult {
  hours?: number;
  maxContinuousHours?: number;
  meanTemperatureC?: number;
  estimated: boolean;
}

export interface IVariableRange {
  min: number;
  max: number;
}

export const RANGOS_PLAUSIBLES_METEOROLOGICOS: Partial<
  Record<VariableMeteorologicaNormalizada, IVariableRange>
> = {
  temperatureC: { min: -55, max: 60 },
  temperatureMinC: { min: -55, max: 60 },
  temperatureMeanC: { min: -55, max: 60 },
  temperatureMaxC: { min: -55, max: 65 },
  relativeHumidityPct: { min: 0, max: 100 },
  relativeHumidityMinPct: { min: 0, max: 100 },
  relativeHumidityMeanPct: { min: 0, max: 100 },
  relativeHumidityMaxPct: { min: 0, max: 100 },
  dewPointC: { min: -70, max: 45 },
  precipitationMm: { min: 0, max: 500 },
  rainMm: { min: 0, max: 500 },
  precipitationHours: { min: 0, max: 24 },
  windSpeedMs: { min: 0, max: 75 },
  windSpeedMaxMs: { min: 0, max: 100 },
  windDirectionDeg: { min: 0, max: 360 },
  windGustMs: { min: 0, max: 120 },
  shortwaveRadiationWm2: { min: 0, max: 1500 },
  shortwaveRadiationMjM2: { min: 0, max: 50 },
  vpdKpa: { min: 0, max: 12 },
  vpdMeanKpa: { min: 0, max: 12 },
  vpdMaxKpa: { min: 0, max: 15 },
  et0Mm: { min: 0, max: 25 },
  sunshineDurationHours: { min: 0, max: 24 },
  daylightDurationHours: { min: 0, max: 24 },
};

/**
 * Parámetros de referencia centralizados. No sustituyen una ficha varietal:
 * cuando se usan, la API agrega una advertencia de calibración.
 */
export const PARAMETROS_AGROMETEOROLOGICOS_REFERENCIA: Partial<
  Record<Cultivo, IParametrosAgrometeorologicos>
> = {
  Maiz: {
    version: AGROMET_DEFAULT_PARAMETERS_VERSION,
    estado: "referencia",
    fuente:
      "FAO-56 y parámetros térmicos operativos CHAMAN; calibrar por híbrido",
    temperaturaBaseC: 10,
    temperaturaSuperiorC: 30,
    kcInicial: 0.3,
    kcMedio: 1.2,
    kcFinal: 0.35,
    umbralFrioC: 8,
    umbralCalorC: 35,
    umbralVpdKpa: 2,
    // FAO: valor conservador para evitar sobreestimar el volumen explorado.
    // Es una referencia de cultivo, no una profundidad medida en el lote.
    profundidadRadicularCm: 100,
    umbralDiaLluviaMm: 0.2,
    coeficientePrecipitacionEfectiva: 0.8,
    coeficienteEscurrimiento: 0.08,
    coeficienteDrenaje: 0.25,
  },
  Soja: {
    version: AGROMET_DEFAULT_PARAMETERS_VERSION,
    estado: "referencia",
    fuente:
      "FAO-56 y parámetros térmicos operativos CHAMAN; calibrar por grupo de madurez",
    temperaturaBaseC: 10,
    temperaturaSuperiorC: 30,
    kcInicial: 0.4,
    kcMedio: 1.15,
    kcFinal: 0.5,
    umbralFrioC: 8,
    umbralCalorC: 35,
    umbralVpdKpa: 1.8,
    profundidadRadicularCm: 60,
    umbralDiaLluviaMm: 0.2,
    coeficientePrecipitacionEfectiva: 0.8,
    coeficienteEscurrimiento: 0.08,
    coeficienteDrenaje: 0.25,
  },
  Trigo: {
    version: AGROMET_DEFAULT_PARAMETERS_VERSION,
    estado: "referencia",
    fuente:
      "FAO AquaCrop y fenología térmica CHAMAN; calibrar por variedad",
    temperaturaBaseC: 0,
    temperaturaSuperiorC: 26,
    kcInicial: 0.3,
    kcMedio: 1.15,
    kcFinal: 0.4,
    umbralFrioC: 0,
    umbralCalorC: 30,
    umbralVpdKpa: 1.6,
    rangoVernalizacionC: { min: 0, max: 10 },
    profundidadRadicularCm: 100,
    umbralDiaLluviaMm: 0.2,
    coeficientePrecipitacionEfectiva: 0.82,
    coeficienteEscurrimiento: 0.07,
    coeficienteDrenaje: 0.24,
  },
  Cebada: {
    version: AGROMET_DEFAULT_PARAMETERS_VERSION,
    estado: "referencia",
    fuente: "FAO-56 y fenología térmica CHAMAN; calibrar por variedad",
    temperaturaBaseC: 0,
    temperaturaSuperiorC: 30,
    kcInicial: 0.3,
    kcMedio: 1.15,
    kcFinal: 0.25,
    umbralFrioC: 0,
    umbralCalorC: 30,
    umbralVpdKpa: 1.6,
    rangoVernalizacionC: { min: 0, max: 10 },
    profundidadRadicularCm: 100,
    umbralDiaLluviaMm: 0.2,
    coeficientePrecipitacionEfectiva: 0.82,
    coeficienteEscurrimiento: 0.07,
    coeficienteDrenaje: 0.24,
  },
  Arveja: {
    version: AGROMET_DEFAULT_PARAMETERS_VERSION,
    estado: "referencia",
    fuente:
      "Fenología térmica de arveja CHAMAN; Kc de referencia sujeto a calibración local",
    temperaturaBaseC: 0,
    temperaturaSuperiorC: 30,
    kcInicial: 0.4,
    kcMedio: 1.15,
    kcFinal: 0.4,
    umbralFrioC: 0,
    umbralCalorC: 30,
    umbralVpdKpa: 1.6,
    profundidadRadicularCm: 60,
    umbralDiaLluviaMm: 0.2,
    coeficientePrecipitacionEfectiva: 0.82,
    coeficienteEscurrimiento: 0.07,
    coeficienteDrenaje: 0.24,
  },
  Papa: {
    version: AGROMET_DEFAULT_PARAMETERS_VERSION,
    estado: "referencia",
    fuente: "FAO-56; calibrar por variedad y manejo",
    temperaturaBaseC: 7,
    temperaturaSuperiorC: 30,
    kcInicial: 0.5,
    kcMedio: 1.15,
    kcFinal: 0.75,
    umbralFrioC: 3,
    umbralCalorC: 30,
    umbralVpdKpa: 1.6,
    profundidadRadicularCm: 40,
    umbralDiaLluviaMm: 0.2,
    coeficientePrecipitacionEfectiva: 0.8,
    coeficienteEscurrimiento: 0.08,
    coeficienteDrenaje: 0.25,
  },
  Vid: perennialReference(10, 0.3, 0.85, 0.45, 100),
  Manzano: perennialReference(7, 0.55, 1.05, 0.8, 100),
  Peral: perennialReference(7, 0.55, 1.05, 0.8, 100),
  // Referencia conservadora provisional de Chaman; requiere calibracion local.
  Pecan: perennialReference(10, 0.5, 1.05, 0.75, 100),
};

function perennialReference(
  base: number,
  kcInitial: number,
  kcMid: number,
  kcEnd: number,
  rootDepthCm: number,
): IParametrosAgrometeorologicos {
  return {
    version: AGROMET_DEFAULT_PARAMETERS_VERSION,
    estado: "referencia",
    fuente:
      "FAO-56 y configuración térmica CHAMAN; calibrar por monte, edad y cobertura",
    temperaturaBaseC: base,
    temperaturaSuperiorC: 35,
    kcInicial: kcInitial,
    kcMedio: kcMid,
    kcFinal: kcEnd,
    umbralFrioC: 0,
    umbralCalorC: 35,
    umbralVpdKpa: 2,
    // Referencia conservadora de cultivo (rango FAO para frutales/vid; Pecan
    // queda provisional en Chaman). La profundidad local validada prevalece.
    profundidadRadicularCm: rootDepthCm,
    umbralDiaLluviaMm: 0.2,
    coeficientePrecipitacionEfectiva: 0.78,
    coeficienteEscurrimiento: 0.1,
    coeficienteDrenaje: 0.25,
  };
}

export function esNumeroFinito(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function numeroFinito(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function validarVariableMeteorologica(
  variable: VariableMeteorologicaNormalizada,
  value: unknown,
): number | undefined {
  const parsed = numeroFinito(value);
  if (parsed === undefined) return undefined;
  const range = RANGOS_PLAUSIBLES_METEOROLOGICOS[variable];
  if (range && (parsed < range.min || parsed > range.max)) return undefined;
  return parsed;
}

export function calcularVpdKpa(
  temperatureC?: number,
  relativeHumidityPct?: number,
): number | undefined {
  if (!esNumeroFinito(temperatureC) || !esNumeroFinito(relativeHumidityPct)) {
    return undefined;
  }
  if (relativeHumidityPct < 0 || relativeHumidityPct > 100) return undefined;
  const rh = relativeHumidityPct;
  const saturation =
    0.6108 * Math.exp((17.27 * temperatureC) / (temperatureC + 237.3));
  return Math.max(0, saturation * (1 - rh / 100));
}

export function calcularPuntoRocioC(
  temperatureC?: number,
  relativeHumidityPct?: number,
): number | undefined {
  if (!esNumeroFinito(temperatureC) || !esNumeroFinito(relativeHumidityPct)) {
    return undefined;
  }
  if (relativeHumidityPct <= 0 || relativeHumidityPct > 100) return undefined;
  const rh = relativeHumidityPct;
  const a = 17.625;
  const b = 243.04;
  const gamma = Math.log(rh / 100) + (a * temperatureC) / (b + temperatureC);
  return (b * gamma) / (a - gamma);
}

export function calcularGdd(params: ICalculoGddParams): number | undefined {
  const min = numeroFinito(params.temperatureMinC);
  const max = numeroFinito(params.temperatureMaxC);
  const base = numeroFinito(params.baseTemperatureC);
  const upper = numeroFinito(params.upperTemperatureC);
  if (min === undefined || max === undefined || base === undefined) {
    return undefined;
  }
  const effectiveUpper = upper !== undefined && upper > base ? upper : 60;
  const adjustedMin = clamp(Math.min(min, max), base, effectiveUpper);
  const adjustedMax = clamp(Math.max(min, max), base, effectiveUpper);
  return Math.max(0, (adjustedMin + adjustedMax) / 2 - base);
}

export function diaDelAnio(value: string | Date): number {
  const date = value instanceof Date ? value : new Date(`${value}T12:00:00Z`);
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.max(1, Math.floor((date.getTime() - start) / 86400000));
}

export function calcularFotoperiodoHoras(
  date: string | Date,
  latitude: number,
): number | undefined {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return undefined;
  }
  const j = diaDelAnio(date);
  const phi = (latitude * Math.PI) / 180;
  const solarDeclination = 0.409 * Math.sin((2 * Math.PI * j) / 365 - 1.39);
  const argument = -Math.tan(phi) * Math.tan(solarDeclination);
  if (argument <= -1) return 24;
  if (argument >= 1) return 0;
  const sunsetHourAngle = Math.acos(argument);
  return (24 / Math.PI) * sunsetHourAngle;
}

export function calcularEt0Fao56(
  params: ICalculoEt0Fao56Params,
): number | undefined {
  const tMin = numeroFinito(params.temperatureMinC);
  const tMax = numeroFinito(params.temperatureMaxC);
  const tMean =
    numeroFinito(params.temperatureMeanC) ??
    (tMin !== undefined && tMax !== undefined ? (tMin + tMax) / 2 : undefined);
  const windAtMeasurementHeight = numeroFinito(params.windSpeedMs);
  const radiation = numeroFinito(params.solarRadiationMjM2);
  const latitude = numeroFinito(params.latitude);
  const day = numeroFinito(params.dayOfYear);
  if (
    tMin === undefined ||
    tMax === undefined ||
    tMean === undefined ||
    windAtMeasurementHeight === undefined ||
    radiation === undefined ||
    latitude === undefined ||
    day === undefined
  ) {
    return undefined;
  }
  const windHeight = Math.max(
    0.5,
    numeroFinito(params.windMeasurementHeightM) ?? 2,
  );
  const wind =
    windHeight === 2
      ? windAtMeasurementHeight
      : windAtMeasurementHeight * (4.87 / Math.log(67.8 * windHeight - 5.42));

  const esMin = saturationVapourPressure(tMin);
  const esMax = saturationVapourPressure(tMax);
  const es = (esMin + esMax) / 2;
  const rhMean = numeroFinito(params.relativeHumidityMeanPct);
  const rhMin = numeroFinito(params.relativeHumidityMinPct);
  const rhMax = numeroFinito(params.relativeHumidityMaxPct);
  let ea: number | undefined;
  if (rhMin !== undefined && rhMax !== undefined) {
    ea = (esMin * clamp(rhMax, 0, 100) + esMax * clamp(rhMin, 0, 100)) / 200;
  } else if (rhMean !== undefined) {
    ea = es * (clamp(rhMean, 0, 100) / 100);
  }
  if (ea === undefined) return undefined;

  const elevation = numeroFinito(params.elevationM) ?? 0;
  const pressure = 101.3 * Math.pow((293 - 0.0065 * elevation) / 293, 5.26);
  const gamma = 0.000665 * pressure;
  const delta =
    (4098 * saturationVapourPressure(tMean)) / Math.pow(tMean + 237.3, 2);
  const phi = (latitude * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * day) / 365);
  const declination = 0.409 * Math.sin((2 * Math.PI * day) / 365 - 1.39);
  const wsArgument = clamp(-Math.tan(phi) * Math.tan(declination), -1, 1);
  const ws = Math.acos(wsArgument);
  const ra =
    ((24 * 60) / Math.PI) *
    0.082 *
    dr *
    (ws * Math.sin(phi) * Math.sin(declination) +
      Math.cos(phi) * Math.cos(declination) * Math.sin(ws));
  const rso = Math.max(0.0001, (0.75 + 0.00002 * elevation) * ra);
  const rns = 0.77 * radiation;
  const cloudFactor = clamp(1.35 * (radiation / rso) - 0.35, 0.05, 1);
  const sigma = 4.903e-9;
  const rnl =
    sigma *
    ((Math.pow(tMax + 273.16, 4) + Math.pow(tMin + 273.16, 4)) / 2) *
    (0.34 - 0.14 * Math.sqrt(Math.max(0, ea))) *
    cloudFactor;
  const rn = rns - rnl;
  const numerator =
    0.408 * delta * rn +
    gamma * (900 / (tMean + 273)) * Math.max(0, wind) * Math.max(0, es - ea);
  const denominator = delta + gamma * (1 + 0.34 * Math.max(0, wind));
  if (denominator <= 0) return undefined;
  return Math.max(0, numerator / denominator);
}

function saturationVapourPressure(temperatureC: number): number {
  return 0.6108 * Math.exp((17.27 * temperatureC) / (temperatureC + 237.3));
}

export function resolverKc(
  parameters: IParametrosAgrometeorologicos,
  progressPct?: number,
  stage?: string,
): number | undefined {
  const normalizedStage = normalizarClave(stage);
  if (normalizedStage && parameters.kcPorEtapa) {
    const matching = Object.entries(parameters.kcPorEtapa).find(
      ([key]) => normalizarClave(key) === normalizedStage,
    );
    if (matching && esNumeroFinito(matching[1])) return matching[1];
  }
  const initial = numeroFinito(parameters.kcInicial);
  const mid = numeroFinito(parameters.kcMedio);
  const end = numeroFinito(parameters.kcFinal);
  const progress = numeroFinito(progressPct);
  if (
    initial === undefined ||
    mid === undefined ||
    end === undefined ||
    progress === undefined
  ) {
    return undefined;
  }
  const pct = clamp(progress, 0, 100);
  if (pct <= 20) return initial;
  if (pct <= 45) return interpolate(initial, mid, (pct - 20) / 25);
  if (pct <= 75) return mid;
  return interpolate(mid, end, (pct - 75) / 25);
}

export function calcularCapacidadAguaUtilMm(
  fieldCapacity?: number,
  wiltingPoint?: number,
  rootDepthCm?: number,
): number | undefined {
  const fc = normalizarContenidoVolumetrico(fieldCapacity);
  const wp = normalizarContenidoVolumetrico(wiltingPoint);
  const depth = numeroFinito(rootDepthCm);
  if (
    fc === undefined ||
    wp === undefined ||
    depth === undefined ||
    depth <= 0 ||
    fc <= wp
  ) {
    return undefined;
  }
  return (fc - wp) * depth * 10;
}

export function normalizarContenidoVolumetrico(
  value?: number,
): number | undefined {
  const parsed = numeroFinito(value);
  if (parsed === undefined || parsed < 0) return undefined;
  if (parsed <= 1) return parsed;
  if (parsed <= 100) return parsed / 100;
  return undefined;
}

export function calcularBalanceHidrico(
  params: IBalanceHidricoParams,
): IResultadoBalanceHidrico {
  const capacity = numeroFinito(params.availableWaterCapacityMm);
  const previous = numeroFinito(params.previousStorageMm);
  const precipitation = Math.max(0, numeroFinito(params.precipitationMm) ?? 0);
  const irrigation = Math.max(0, numeroFinito(params.irrigationMm) ?? 0);
  const etc = numeroFinito(params.etcMm);
  if (capacity === undefined || capacity <= 0 || etc === undefined) {
    return { estimated: true };
  }

  const effectiveCoefficient = clamp(
    numeroFinito(params.effectiveRainCoefficient) ?? 0.8,
    0,
    1,
  );
  const runoffCoefficient = clamp(
    numeroFinito(params.runoffCoefficient) ?? 0.08,
    0,
    1,
  );
  const drainageCoefficient = clamp(
    numeroFinito(params.drainageCoefficient) ?? 0.25,
    0,
    1,
  );
  const effectivePrecipitation = precipitation * effectiveCoefficient;
  const baseRunoff = precipitation * runoffCoefficient;
  const initialStorage = clamp(previous ?? capacity, 0, capacity);
  const beforeDrainage =
    initialStorage +
    effectivePrecipitation +
    irrigation -
    Math.max(0, etc) -
    baseRunoff;
  const excess = Math.max(0, beforeDrainage - capacity);
  const deepDrainage = excess * drainageCoefficient;
  const saturationRunoff = excess - deepDrainage;
  const runoff = baseRunoff + saturationRunoff;
  const storage = clamp(beforeDrainage - excess, 0, capacity);
  const availablePct = (storage / capacity) * 100;
  const deficit = Math.max(0, capacity - storage);
  return {
    effectivePrecipitationMm: effectivePrecipitation,
    runoffMm: runoff,
    deepDrainageMm: deepDrainage,
    storageMm: storage,
    availableWaterPercentage: availablePct,
    waterDeficitMm: deficit,
    waterStressIndex: clamp(1 - storage / capacity, 0, 1),
    estimated: previous === undefined,
  };
}

export function calcularMojadoFoliarEstimado(
  hours: ILeafWetnessHour[],
): ILeafWetnessResult {
  if (!Array.isArray(hours) || !hours.length) {
    return { estimated: true };
  }
  let count = 0;
  let continuous = 0;
  let maxContinuous = 0;
  let temperatureSum = 0;
  let temperatureCount = 0;
  for (const hour of hours) {
    const rain = numeroFinito(hour.precipitationMm) ?? 0;
    const rh = numeroFinito(hour.relativeHumidityPct);
    const temperature = numeroFinito(hour.temperatureC);
    const dewPoint =
      numeroFinito(hour.dewPointC) ?? calcularPuntoRocioC(temperature, rh);
    const nearDewPoint =
      temperature !== undefined && dewPoint !== undefined
        ? Math.abs(temperature - dewPoint) <= 2
        : false;
    const wet = rain > 0 || (rh !== undefined && rh >= 90 && nearDewPoint);
    if (wet) {
      count += 1;
      continuous += 1;
      maxContinuous = Math.max(maxContinuous, continuous);
      if (temperature !== undefined) {
        temperatureSum += temperature;
        temperatureCount += 1;
      }
    } else {
      continuous = 0;
    }
  }
  return {
    hours: count,
    maxContinuousHours: maxContinuous,
    meanTemperatureC:
      temperatureCount > 0 ? temperatureSum / temperatureCount : undefined,
    estimated: true,
  };
}

export function promedioPonderadoZonaRadicular(
  valuesByDepth: Record<string, number> | undefined,
  rootDepthCm?: number,
): number | undefined {
  if (!valuesByDepth || !Object.keys(valuesByDepth).length) return undefined;
  const rootDepth = numeroFinito(rootDepthCm);
  const layers = Object.entries(valuesByDepth)
    .map(([key, value]) => ({
      ...parseDepthRange(key),
      value: numeroFinito(value),
    }))
    .filter(
      (item): item is { min: number; max: number; value: number } =>
        item.value !== undefined && item.max > item.min,
    );
  if (!layers.length) return undefined;
  const effectiveDepth =
    rootDepth && rootDepth > 0
      ? rootDepth
      : Math.max(...layers.map((item) => item.max));
  let weighted = 0;
  let totalWeight = 0;
  for (const layer of layers) {
    const overlap = Math.max(
      0,
      Math.min(effectiveDepth, layer.max) - layer.min,
    );
    if (overlap <= 0) continue;
    weighted += layer.value * overlap;
    totalWeight += overlap;
  }
  return totalWeight > 0 ? weighted / totalWeight : undefined;
}

export function calcularCompletitud(
  values: IValoresMeteorologicosNormalizados,
  required: VariableMeteorologicaNormalizada[],
): number {
  if (!required.length) return 100;
  const present = required.filter((key) => {
    const value = values[key as keyof IValoresMeteorologicosNormalizados];
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") return value.length > 0;
    return (
      !!value && typeof value === "object" && Object.keys(value).length > 0
    );
  }).length;
  return Math.round((present / required.length) * 1000) / 10;
}

function parseDepthRange(value: string): { min: number; max: number } {
  const numbers =
    String(value)
      .match(/\d+(?:\.\d+)?/g)
      ?.map(Number) || [];
  if (numbers.length >= 2) return { min: numbers[0], max: numbers[1] };
  if (numbers.length === 1) return { min: 0, max: numbers[0] };
  return { min: 0, max: 0 };
}

function interpolate(from: number, to: number, factor: number): number {
  return from + (to - from) * clamp(factor, 0, 1);
}

function normalizarClave(value?: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
