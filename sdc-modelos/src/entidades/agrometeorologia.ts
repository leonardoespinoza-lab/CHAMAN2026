import { ICoordenadas } from "../compartidos";

export type FuenteMeteorologicaNormalizada =
  | "sensor"
  | "station"
  | "open_meteo"
  | "chaman_meteo"
  | "mixed"
  | "derived_sensor"
  | "derived_station"
  | "derived_open_meteo"
  | "derived_chaman_meteo"
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
  /**
   * Contexto espacial exacto del lote. Las observaciones de una central
   * pueden compartirse, pero Open-Meteo debe conservarse por lote.
   */
  idLote?: string;
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
  contextosLote?: Record<string, IContextoMeteorologicoLote>;
}

export type IContextoMeteorologicoLote = Omit<
  IObservacionMeteorologicaNormalizada,
  "_id" | "contextosLote" | "creadoEn" | "actualizadoEn"
>;

export interface IParametrosAgrometeorologicos {
  version: string;
  estado?: "validado" | "referencia" | "requiere_calibracion";
  fuente?: string;
  procesoTermico?:
    | "dormancia_perenne"
    | "vernalizacion_anual"
    | "termico_fotoperiodico"
    | "termico";
  temperaturaBaseC?: number;
  temperaturaSuperiorC?: number;
  metodoGdd?: "promedio_limitado";
  /**
   * Los rangos son acumulados desde el inicio térmico explícito. Los perfiles
   * legacy sin esta semántica siguen siendo sólo referencias visuales.
   */
  semanticaGddPorEtapa?: "rangos_acumulados_desde_inicio_termico";
  gddPorEtapa?: Record<
    string,
    { orden?: number; min?: number; max?: number; objetivo?: number }
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
  /**
   * El motor vigente implementa una ventana térmica calibrada. Los nombres
   * APSIM no se ofrecen ni se aceptan como modelo porque sus ecuaciones no
   * están implementadas en Chaman.
   */
  modeloVernalizacion?: "ventana_calibrada";
  habitoVernalizacion?: "primaveral" | "facultativo" | "invernal" | "desconocido";
  fuenteVernalizacion?: string;
  estadoVernalizacion?:
    | "validado"
    | "referencia"
    | "requiere_calibracion";
  ventanaVernalizacion?: {
    inicioEtapa: string;
    finEtapa: string;
    unidad: "dias_equivalentes";
  };
  fotoperiodoVarietal?: {
    modelo: "umbral_por_etapa";
    estado: "validado" | "referencia" | "requiere_calibracion";
    fuente?: string;
    porEtapa: Record<
      string,
      {
        respuesta: "dia_corto" | "dia_largo" | "neutra";
        umbralHoras?: number;
      }
    >;
  };
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
  /**
   * Solo es verdadero cuando existe un día térmico utilizable por cada fecha
   * desde el inicio de la acumulación. Evita presentar una suma parcial como
   * acumulado fenológico completo.
   */
  gddAccumulationComplete?: boolean;
  gddBaseTemperatureC?: number;
  gddUpperTemperatureC?: number;
  gddFromEmergence?: number;
  gddCurrentStage?: number;
  photoperiodHours?: number;
  photoperiodChangeMinutes?: number;
  sunrise?: string;
  sunset?: string;
  chillingHours?: number;
  chillingHoursAccumulated?: number;
  chillingTemperatureCoveragePct?: number;
  chillingMaximumGapHours?: number;
  chillingContinuitySufficient?: boolean;
  utahChillUnits?: number;
  utahChillUnitsAccumulated?: number;
  chillPortions?: number;
  chillPortionsAccumulated?: number;
  /**
   * Lectura paralela de la temperatura de aire medida por sensores del lote.
   * Es auditable aun con calificación "referencia", pero nunca reemplaza las
   * métricas canónicas ni habilita compatibilidad varietal en ese estado.
   */
  fieldChillingHours?: number;
  fieldChillingHoursAccumulated?: number;
  fieldUtahChillUnits?: number;
  fieldUtahChillUnitsAccumulated?: number;
  fieldChillPortions?: number;
  fieldChillPortionsAccumulated?: number;
  fieldChillingTemperatureCoveragePct?: number;
  fieldChillingMaximumGapHours?: number;
  fieldChillingContinuitySufficient?: boolean;
  vernalizationUnits?: number;
  vernalizationAccumulated?: number;
  vernalizationTemperatureCoveragePct?: number;
  vernalizationMaximumGapHours?: number;
  vernalizationContinuitySufficient?: boolean;
  vernalizationWindowActive?: boolean;
  photoperiodCompatible?: boolean;
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
  fieldTemperatureCoveragePct?: number;
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
  /**
   * Identifica una corrida completa del motor. Solo la generación activada
   * por siembra y versión puede exponerse a clientes.
   */
  generacionCalculo?: string;
  idSiembra: string;
  idLote: string;
  idEstablecimiento: string;
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  fecha: string;
  esPronostico: boolean;
  etapaFenologica?: string;
  fuenteEtapaFenologica?:
    | "campo"
    | "proyeccion_anclada_campo"
    | "gdd_validado"
    | "cronograma_referencia"
    | "rango_termico_referencia"
    | "seguimiento";
  confianzaEtapaFenologica?: "alta" | "media" | "referencia";
  versionModeloFenologico?: string;
  metricas: IMetricasAgrometeorologicasDiarias;
  fuente: FuenteMeteorologicaNormalizada;
  fuentePorVariable: Partial<
    Record<VariableMeteorologicaNormalizada, FuenteMeteorologicaNormalizada>
  >;
  banderasCalidad: string[];
  advertencias: string[];
  completitudPct: number;
  coberturaCampoPct?: number;
  ultimaObservacionCampo?: string;
  calidadTemperaturaCampo?: "calificado" | "referencia";
  nombresSensoresTemperaturaCampo?: string[];
  procesoTermico?: IParametrosAgrometeorologicos["procesoTermico"];
  estadoParametros?: IParametrosAgrometeorologicos["estado"];
  fuenteParametros?: string;
  modeloVernalizacion?: IParametrosAgrometeorologicos["modeloVernalizacion"];
  habitoVernalizacion?: IParametrosAgrometeorologicos["habitoVernalizacion"];
  requerimientoVernalizacion?: number;
  estadoVernalizacion?: IParametrosAgrometeorologicos["estadoVernalizacion"];
  inicioVentanaFrio?: string;
  inicioVentanaVernalizacion?: string;
  finVentanaVernalizacion?: string;
  modeloFrioRector?: "HF" | "CP" | "sin_calibrar";
  estadoRequerimientoFrio?:
    | "validado"
    | "referencia"
    | "requiere_calibracion";
  fuenteRequerimientoFrio?: string;
  confianzaRequerimientoFrio?: "alta" | "media" | "estimada";
  objetivoFrioRector?: number;
  versionCalculo: string;
  versionParametros: string;
  calculadoEn: string;
  creadoEn?: string;
  actualizadoEn?: string;
}

export interface IResumenAgrometeorologico {
  gddAccumulated?: number;
  gddAccumulationComplete?: boolean;
  gddThroughDate?: string;
  gddBaseTemperatureC?: number;
  gddUpperTemperatureC?: number;
  rainAccumulatedMm?: number;
  et0AccumulatedMm?: number;
  etcAccumulatedMm?: number;
  availableWaterPercentage?: number;
  waterDeficitMm?: number;
  vpdMeanKpa?: number;
  currentPhotoperiodHours?: number;
  thermalProcess?: IParametrosAgrometeorologicos["procesoTermico"];
  parametersStatus?: IParametrosAgrometeorologicos["estado"];
  parametersSource?: string;
  vernalizationModel?: IParametrosAgrometeorologicos["modeloVernalizacion"];
  vernalizationHabit?: IParametrosAgrometeorologicos["habitoVernalizacion"];
  vernalizationRequirement?: number;
  vernalizationStatus?: IParametrosAgrometeorologicos["estadoVernalizacion"];
  vernalizationWindowStart?: string;
  vernalizationWindowEnd?: string;
  vernalizationTemperatureCoveragePct?: number;
  vernalizationMaximumGapHours?: number;
  vernalizationContinuitySufficient?: boolean;
  vernalizationInterpretation?:
    | "no_requerida"
    | "sin_calibrar"
    | "sin_biofix_inicio"
    | "datos_insuficientes"
    | "en_acumulacion"
    | "ventana_cerrada";
  coldSeasonStart?: string;
  coldThroughDate?: string;
  coldModelVersion?: string;
  chillingTemperatureCoveragePct?: number;
  chillingMaximumGapHours?: number;
  chillingContinuitySufficient?: boolean;
  chillingHoursAccumulated?: number;
  utahChillUnitsAccumulated?: number;
  chillPortionsAccumulated?: number;
  fieldCold?: {
    quality: "qualified" | "reference";
    sensorNames?: string[];
    throughDate?: string;
    lastObservationAt?: string;
    modelVersion?: string;
    chillingHoursAccumulated?: number;
    utahChillUnitsAccumulated?: number;
    chillPortionsAccumulated?: number;
    temperatureCoveragePercentage?: number;
    maximumGapHours?: number;
    continuitySufficient?: boolean;
    interpretation:
      | "qualified"
      | "reference_not_calibrated"
      | "insufficient_data";
  };
  vernalizationAccumulated?: number;
  coldRequirement?: {
    model: "HF" | "CP" | "sin_calibrar";
    status: "validado" | "referencia" | "requiere_calibracion";
    source?: string;
    confidence?: "alta" | "media" | "estimada";
    target?: number;
    accumulated?: number;
    progressPercentage?: number;
    compatible?: boolean;
    coveragePercentage?: number;
    minimumCoveragePercentage?: number;
    coverageSufficient?: boolean;
    maximumGapHours?: number;
    maximumAllowedGapHours?: number;
    continuitySufficient?: boolean;
    /**
     * Compatibilidad climática, nunca confirmación fenológica. El inicio real
     * de etapa se registra a campo mediante observación/biofix.
     */
    interpretation:
      | "sin_calibrar"
      | "datos_insuficientes"
      | "en_acumulacion"
      | "compatible_requiere_confirmacion";
  };
}

export interface IFuenteAgrometeorologicaResumen {
  type:
    | "sensor"
    | "station"
    | "open_meteo"
    | "chaman_meteo"
    | "mixed"
    | "sin_datos";
  sources?: Array<"sensor" | "station" | "open_meteo" | "chaman_meteo">;
  stationName?: string;
  lastObservationAt?: string;
  lastCalculatedAt?: string;
  completenessPercentage: number;
  fieldCoveragePercentage?: number;
  sensorNames?: string[];
  fieldTemperatureQuality?: "qualified" | "reference";
}

export interface ISerieAgrometeorologicaDia {
  date: string;
  isForecast: boolean;
  stage?: string;
  stageSource?: IIndicadorAgrometeorologicoDiario["fuenteEtapaFenologica"];
  stageConfidence?: IIndicadorAgrometeorologicoDiario["confianzaEtapaFenologica"];
  phenologyModelVersion?: string;
  weather: IValoresMeteorologicosNormalizados;
  metrics: IMetricasAgrometeorologicasDiarias;
  source: FuenteMeteorologicaNormalizada;
  sourceByVariable: Partial<
    Record<VariableMeteorologicaNormalizada, FuenteMeteorologicaNormalizada>
  >;
  qualityFlags: string[];
  warnings: string[];
}

/**
 * Observacion horaria canonica ya resuelta con la misma jerarquia que usa el
 * motor agrometeorologico. Se publica de forma opcional para motores que no
 * pueden reconstruirse con agregados diarios (por ejemplo, rachas sanitarias).
 */
export interface ISerieAgrometeorologicaHora {
  timestamp: string;
  localDate: string;
  timezone: string;
  isForecast: boolean;
  state: EstadoDatoMeteorologico;
  weather: IValoresMeteorologicosNormalizados;
  source: FuenteMeteorologicaNormalizada;
  sourceByVariable: Partial<
    Record<VariableMeteorologicaNormalizada, FuenteMeteorologicaNormalizada>
  >;
  stateByVariable?: Partial<
    Record<VariableMeteorologicaNormalizada, EstadoDatoMeteorologico>
  >;
  qualityFlags: string[];
  completenessPercentage: number;
}

export interface IRespuestaAgrometeorologiaSiembra {
  summary: IResumenAgrometeorologico;
  dataSource: IFuenteAgrometeorologicaResumen;
  series: ISerieAgrometeorologicaDia[];
  hourlySeries?: ISerieAgrometeorologicaHora[];
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
