import { ICoordenadas } from "../compartidos";

export type FuenteMeteorologicaNormalizada =
  | "station"
  | "open_meteo"
  | "mixed"
  | "derived_station"
  | "derived_open_meteo"
  | "gap_filled";

export type EstadoDatoMeteorologico =
  | "observed"
  | "estimated"
  | "forecast"
  | "missing"
  | "invalid";

export type GranularidadMeteorologica = "hourly" | "daily";

export type VariableMeteorologicaNormalizada =
  | "temperatureC"
  | "temperatureMinC"
  | "temperatureMeanC"
  | "temperatureMaxC"
  | "relativeHumidityPct"
  | "relativeHumidityMinPct"
  | "relativeHumidityMeanPct"
  | "relativeHumidityMaxPct"
  | "dewPointC"
  | "precipitationMm"
  | "rainMm"
  | "precipitationHours"
  | "windSpeedMs"
  | "windSpeedMaxMs"
  | "windDirectionDeg"
  | "windGustMs"
  | "shortwaveRadiationWm2"
  | "shortwaveRadiationMjM2"
  | "vpdKpa"
  | "vpdMeanKpa"
  | "vpdMaxKpa"
  | "et0Mm"
  | "sunshineDurationHours"
  | "daylightDurationHours"
  | "sunrise"
  | "sunset"
  | "soilTemperatureC"
  | "soilMoistureM3M3";

export interface IValoresMeteorologicosNormalizados {
  temperatureC?: number;
  temperatureMinC?: number;
  temperatureMeanC?: number;
  temperatureMaxC?: number;
  relativeHumidityPct?: number;
  relativeHumidityMinPct?: number;
  relativeHumidityMeanPct?: number;
  relativeHumidityMaxPct?: number;
  dewPointC?: number;
  precipitationMm?: number;
  rainMm?: number;
  precipitationHours?: number;
  windSpeedMs?: number;
  windSpeedMaxMs?: number;
  windDirectionDeg?: number;
  windGustMs?: number;
  shortwaveRadiationWm2?: number;
  shortwaveRadiationMjM2?: number;
  vpdKpa?: number;
  vpdMeanKpa?: number;
  vpdMaxKpa?: number;
  et0Mm?: number;
  sunshineDurationHours?: number;
  daylightDurationHours?: number;
  sunrise?: string;
  sunset?: string;
  soilTemperatureC?: Record<string, number>;
  soilMoistureM3M3?: Record<string, number>;
}

export interface IObservacionMeteorologicaNormalizada {
  _id?: string;
  idEstablecimiento: string;
  timestamp: string;
  fechaLocal: string;
  timezone: string;
  granularidad: GranularidadMeteorologica;
  estado: EstadoDatoMeteorologico;
  esPronostico: boolean;
  valores: IValoresMeteorologicosNormalizados;
  fuente: FuenteMeteorologicaNormalizada;
  fuentePorVariable: Partial<
    Record<VariableMeteorologicaNormalizada, FuenteMeteorologicaNormalizada>
  >;
  estadoPorVariable?: Partial<
    Record<VariableMeteorologicaNormalizada, EstadoDatoMeteorologico>
  >;
  banderasCalidad: string[];
  completitudPct: number;
  estacionId?: string;
  estacionNombre?: string;
  coordenadas?: ICoordenadas;
  altitudM?: number;
  obtenidoEn: string;
  creadoEn?: string;
  actualizadoEn?: string;
}

export interface IParametrosAgrometeorologicos {
  version: string;
  estado?: "validado" | "referencia" | "requiere_calibracion";
  fuente?: string;
  temperaturaBaseC?: number;
  temperaturaSuperiorC?: number;
  metodoGdd?: "promedio_limitado";
  gddPorEtapa?: Record<
    string,
    { min?: number; max?: number; objetivo?: number }
  >;
  kcPorEtapa?: Record<string, number>;
  kcInicial?: number;
  kcMedio?: number;
  kcFinal?: number;
  umbralFrioC?: number;
  umbralCalorC?: number;
  umbralVpdKpa?: number;
  umbralesPorEtapa?: Record<
    string,
    { frioC?: number; calorC?: number; vpdKpa?: number }
  >;
  rangoVernalizacionC?: { min: number; max: number };
  requerimientoVernalizacion?: number;
  profundidadRadicularCm?: number;
  profundidadRadicularPorEtapa?: Record<string, number>;
  umbralDiaLluviaMm?: number;
  coeficientePrecipitacionEfectiva?: number;
  coeficienteEscurrimiento?: number;
  coeficienteDrenaje?: number;
}

export interface IMetricasAgrometeorologicasDiarias {
  temperatureMinC?: number;
  temperatureMeanC?: number;
  temperatureMaxC?: number;
  coldHours?: number;
  heatHours?: number;
  frostDay?: boolean;
  thermalStressDay?: boolean;
  gddDaily?: number;
  gddAccumulated?: number;
  gddFromEmergence?: number;
  gddCurrentStage?: number;
  photoperiodHours?: number;
  photoperiodChangeMinutes?: number;
  sunrise?: string;
  sunset?: string;
  chillingHours?: number;
  chillingHoursAccumulated?: number;
  vernalizationUnits?: number;
  vernalizationAccumulated?: number;
  relativeHumidityMinPct?: number;
  relativeHumidityMeanPct?: number;
  relativeHumidityMaxPct?: number;
  dewPointC?: number;
  vpdMeanKpa?: number;
  vpdMaxKpa?: number;
  vpdStressHours?: number;
  solarRadiationMjM2?: number;
  solarRadiationAccumulatedMjM2?: number;
  sunshineDurationHours?: number;
  radiationRollingMean7d?: number;
  et0Mm?: number;
  et0AccumulatedMm?: number;
  kc?: number;
  etcMm?: number;
  etcAccumulatedMm?: number;
  precipitationMm?: number;
  effectivePrecipitationMm?: number;
  irrigationMm?: number;
  runoffMm?: number;
  deepDrainageMm?: number;
  soilWaterStorageMm?: number;
  availableWaterCapacityMm?: number;
  availableWaterPercentage?: number;
  waterDeficitMm?: number;
  waterStressIndex?: number;
  rainAccumulatedMm?: number;
  rain7dMm?: number;
  rain15dMm?: number;
  rain30dMm?: number;
  rainyDaysAccumulated?: number;
  consecutiveDryDays?: number;
  maxHourlyRainMm?: number;
  leafWetnessHours?: number;
  maxContinuousLeafWetnessHours?: number;
  meanTemperatureDuringLeafWetnessC?: number;
  rootZoneSoilTemperatureC?: number;
  rootZoneSoilMoistureM3M3?: number;
  soilTemperatureC?: Record<string, number>;
  soilMoistureM3M3?: Record<string, number>;
}

export interface IIndicadorAgrometeorologicoDiario {
  _id?: string;
  idSiembra: string;
  idLote: string;
  idEstablecimiento: string;
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  fecha: string;
  esPronostico: boolean;
  etapaFenologica?: string;
  metricas: IMetricasAgrometeorologicasDiarias;
  fuente: FuenteMeteorologicaNormalizada;
  fuentePorVariable: Partial<
    Record<VariableMeteorologicaNormalizada, FuenteMeteorologicaNormalizada>
  >;
  banderasCalidad: string[];
  advertencias: string[];
  completitudPct: number;
  versionCalculo: string;
  versionParametros: string;
  calculadoEn: string;
  creadoEn?: string;
  actualizadoEn?: string;
}

export interface IResumenAgrometeorologico {
  gddAccumulated?: number;
  rainAccumulatedMm?: number;
  et0AccumulatedMm?: number;
  etcAccumulatedMm?: number;
  availableWaterPercentage?: number;
  waterDeficitMm?: number;
  vpdMeanKpa?: number;
  currentPhotoperiodHours?: number;
}

export interface IFuenteAgrometeorologicaResumen {
  type: "station" | "open_meteo" | "mixed" | "sin_datos";
  stationName?: string;
  lastObservationAt?: string;
  lastCalculatedAt?: string;
  completenessPercentage: number;
}

export interface ISerieAgrometeorologicaDia {
  date: string;
  isForecast: boolean;
  stage?: string;
  weather: IValoresMeteorologicosNormalizados;
  metrics: IMetricasAgrometeorologicasDiarias;
  source: FuenteMeteorologicaNormalizada;
  sourceByVariable: Partial<
    Record<VariableMeteorologicaNormalizada, FuenteMeteorologicaNormalizada>
  >;
  qualityFlags: string[];
  warnings: string[];
}

export interface IRespuestaAgrometeorologiaSiembra {
  summary: IResumenAgrometeorologico;
  dataSource: IFuenteAgrometeorologicaResumen;
  series: ISerieAgrometeorologicaDia[];
  warnings: string[];
  calculationVersion: string;
  parametersVersion: string;
}

export interface ICreateObservacionMeteorologica extends Omit<
  IObservacionMeteorologicaNormalizada,
  "_id" | "creadoEn" | "actualizadoEn"
> {}

export interface ICreateIndicadorAgrometeorologico extends Omit<
  IIndicadorAgrometeorologicoDiario,
  "_id" | "creadoEn" | "actualizadoEn"
> {}
