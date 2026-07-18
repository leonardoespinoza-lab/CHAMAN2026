import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import SunCalc from 'suncalc';
import {
  AGROMET_DEFAULT_PARAMETERS_VERSION,
  AGROMET_ENGINE_VERSION,
  aplicarEntradasAgronomicasSuelo,
  calcularBalanceHidrico,
  calcularCapacidadAguaUtilMm,
  calcularEt0Fao56,
  calcularFotoperiodoHoras,
  calcularFrioTermico,
  calcularGdd,
  calcularMojadoFoliarEstimado,
  calcularPuntoRocioC,
  calcularVpdKpa,
  clamp,
  diaDelAnio,
  esCultivoPerenne,
  esNumeroFinito,
  evaluarEvidenciaTermicaVarietal,
  FuenteMeteorologicaNormalizada,
  FRIO_TERMICO_ENGINE_VERSION,
  ICoordenadas,
  ICreateIndicadorAgrometeorologico,
  IIndicadorAgrometeorologicoDiario,
  ILote,
  IMetricasAgrometeorologicasDiarias,
  IObservacionMeteorologicaNormalizada,
  IParametrosAgrometeorologicos,
  IRegistroFenologico,
  IRespuestaAgrometeorologiaSiembra,
  ISerieAgrometeorologicaDia,
  ISiembra,
  IValoresMeteorologicosNormalizados,
  IEntradasAgronomicasSuelo,
  normalizarContenidoVolumetrico,
  numeroFinito,
  PARAMETROS_AGROMETEOROLOGICOS_REFERENCIA,
  promedioPonderadoZonaRadicular,
  resolverFenologiaTermicaArveja,
  resolverKc,
  VariableMeteorologicaNormalizada,
} from 'modelos/src';
import { AgrometeorologiaRepository } from './repository';
import { SensorWeatherOverlayService } from './sensor-weather-overlay.service';
import { WeatherIngestionService } from './weather-ingestion.service';

const INDICATOR_PERSIST_BATCH_SIZE = 100;
const LEGACY_AGROMET_ENGINE_VERSION = 'agromet-1.1.1';
const ANNUAL_CHRONO_STAGE_LABELS: Record<string, string[]> = {
  trigo: [
    'Siembra',
    'Emergencia',
    'Espiguilla Terminal',
    'Hoja Bandera',
    'Espigazon',
    'Antesis',
    'Llenado de Granos',
    'Madurez Fisiologica',
  ],
  soja: [
    'Siembra',
    'Emergencia',
    'Floracion',
    'Fructificacion',
    'Inicio de llenado',
    'Madurez Fisiologica',
  ],
  maiz: ['Siembra', 'Emergencia', 'Floracion', 'Madurez'],
  cebada: [
    'Siembra',
    'Emergencia',
    'Primer Nudo',
    'Hoja Bandera',
    'Espigazon',
    'Antesis',
    'Llenado de Granos',
    'Madurez Fisiologica',
  ],
};
import { AGROMETEO_FORECAST_MAX_AGE_HOURS } from '../../env';

interface ISoilProfile {
  capacityMm?: number;
  fieldCapacity?: number;
  wiltingPoint?: number;
  rootDepthCm?: number;
  hydraulicCoverageCm?: number;
  estimated: boolean;
  source?: 'confirmed_lot' | 'soil_intelligence' | 'crop_reference';
  depthSource?:
    | 'crop_parameter'
    | 'confirmed_root_profile'
    | 'operational_fallback';
  depthConfidence?: 'high' | 'medium' | 'low' | 'unavailable';
  depthIsFallback?: boolean;
  effectiveDepthLimitCm?: number;
  effectiveDepthSource?: string;
  effectiveDepthConfidence?: 'high' | 'medium' | 'low' | 'unavailable';
  effectiveDepthIsFallback?: boolean;
  limitedByEffectiveDepth?: boolean;
  hydraulicDepthLimitCm?: number;
  limitedByHydraulicCoverage?: boolean;
  requestedRootDepthCm?: number;
  incompleteHydraulicCoverage?: boolean;
  hydraulicIsScreening?: boolean;
  pointSensorHydraulicsIgnored?: boolean;
  potentialProfileCapacityIgnored?: boolean;
  legacyUniformHydraulicsIgnored?: boolean;
}

interface IRootDepthResolution {
  depthCm: number;
  source: NonNullable<ISoilProfile['depthSource']>;
  confidence: NonNullable<ISoilProfile['depthConfidence']>;
  estimated: boolean;
  isFallback: boolean;
  effectiveDepthLimitCm?: number;
  effectiveDepthSource?: string;
  effectiveDepthConfidence?: 'high' | 'medium' | 'low' | 'unavailable';
  effectiveDepthIsFallback?: boolean;
  limitedByEffectiveDepth: boolean;
}

const OPERATIONAL_ROOT_DEPTH_FALLBACK_CM = 100;
const MAX_VALID_ROOT_DEPTH_CM = 500;
const ROOT_ZONE_COVERAGE_TOLERANCE_CM = 1;
const MIN_COLD_TEMPERATURE_COVERAGE_PCT = 75;
const MAX_COLD_CONTINUOUS_GAP_HOURS = 6;
const MIN_VERNALIZATION_TEMPERATURE_COVERAGE_PCT = 90;
const MIN_DAILY_VERNALIZATION_COVERAGE_PCT = 100;
const MAX_VERNALIZATION_CONTINUOUS_GAP_HOURS = 6;
const MIN_DAILY_TEMPERATURE_HOURLY_COVERAGE_PCT = 75;
const MIN_DAILY_TEMPERATURE_REPLACEMENT_COVERAGE_PCT = 100;
const MIN_DAILY_HUMIDITY_HOURLY_COVERAGE_PCT = 75;
const MIN_DAILY_TOTAL_HOURLY_COVERAGE_PCT = 100;
const DEFAULT_OPERATIONAL_TIMEZONE = 'America/Argentina/Buenos_Aires';
const HOUR_MS = 3600000;

type DailyHourlyAggregate = 'humidity' | 'precipitation' | 'radiation' | 'et0';

interface IHourlyAggregateCoverage {
  metric: DailyHourlyAggregate;
  coveragePct: number;
  requiredPct: number;
  accepted: boolean;
}

interface IDailyDerived {
  temperatureMinC?: number;
  temperatureMeanC?: number;
  temperatureMaxC?: number;
  humidityMinPct?: number;
  humidityMeanPct?: number;
  humidityMaxPct?: number;
  dewPointC?: number;
  precipitationMm?: number;
  maxHourlyRainMm?: number;
  vpdMeanKpa?: number;
  vpdMaxKpa?: number;
  coldHours?: number;
  heatHours?: number;
  vpdStressHours?: number;
  chillingHours?: number;
  leafWetnessHours?: number;
  maxContinuousLeafWetnessHours?: number;
  meanTemperatureDuringLeafWetnessC?: number;
  solarRadiationMjM2?: number;
  et0Mm?: number;
  rootZoneSoilTemperatureC?: number;
  rootZoneSoilMoistureM3M3?: number;
  soilTemperatureC?: Record<string, number>;
  soilMoistureM3M3?: Record<string, number>;
  temperatureHourlyCoveragePct?: number;
  temperatureHighestSourcePriority?: number;
  hourlyAggregateCoverage: IHourlyAggregateCoverage[];
  sourceByVariable: Partial<
    Record<VariableMeteorologicaNormalizada, FuenteMeteorologicaNormalizada>
  >;
}

interface IDailyWeatherMerge {
  values: IValoresMeteorologicosNormalizados;
  sourceByVariable: Partial<
    Record<VariableMeteorologicaNormalizada, FuenteMeteorologicaNormalizada>
  >;
  rejectedHigherPriorityTemperatureCoverage?: {
    coveragePct: number;
    requiredPct: number;
  };
  partialHourlyTemperatureCoverage?: number;
  hourlyAggregateCoverage: IHourlyAggregateCoverage[];
}

interface IDailyColdThermal {
  chillingHours?: number;
  utahChillUnits?: number;
  chillPortions?: number;
  dailyCoveragePct: number;
  /**
   * Cobertura acumulada desde el inicio de la temporada hasta este dia.
   * Es la que habilita (o bloquea) una comparacion biologica varietal.
   */
  coveragePct: number;
  hoursWithData: number;
}

interface IColdThermalSeries {
  byDate: Map<string, IDailyColdThermal>;
  warnings: string[];
  maximumGapHours?: number;
  continuitySufficient?: boolean;
}

interface IColdSeasonWindow {
  start: string;
  end?: string;
  comparisonReady: boolean;
  usedFallback: boolean;
  warnings: string[];
}

interface IDailyVernalization {
  equivalentDays?: number;
  coveragePct: number;
  windowActive: boolean;
}

interface IVernalizationSeries {
  byDate: Map<string, IDailyVernalization>;
  warnings: string[];
  start?: string;
  end?: string;
  coveragePct?: number;
  maximumGapHours?: number;
  continuitySufficient?: boolean;
}

interface IThermalStageContext {
  vernalizationAccumulated?: number;
  vernalizationCoverageSufficient?: boolean;
  vernalizationContinuitySufficient?: boolean;
  photoperiodHours?: number;
}

type TThermalStageGate =
  | 'vernalizacion_sin_calibrar'
  | 'vernalizacion_pendiente'
  | 'fotoperiodo_incompatible';

interface IStageProvenance {
  source:
    | 'campo'
    | 'proyeccion_anclada_campo'
    | 'gdd_validado'
    | 'cronograma_referencia'
    | 'rango_termico_referencia'
    | 'seguimiento';
  confidence: 'alta' | 'media' | 'referencia';
  modelVersion?: string;
}

interface IFieldStageResolution {
  stage: string;
  exactFieldRecord: boolean;
  confidence: IStageProvenance['confidence'];
  modelVersion: string;
}

interface IPhotoperiodStageLimit {
  stageIndex: number;
  blockedStageIndex?: number;
}

interface IFieldSourceContext {
  fieldObservations?: IObservacionMeteorologicaNormalizada[];
  fieldCoverageByDate: Map<string, number>;
  sensorNames: string[];
  fieldTemperatureSensorNames?: string[];
  lastFieldObservationAt?: string;
  fieldTemperatureDecisionReady: boolean;
  fieldTemperatureQuality?: 'calificado' | 'referencia';
  unqualifiedTemperatureSensorNames: string[];
}

interface IColdRequirementResolution {
  model: 'HF' | 'CP' | 'sin_calibrar';
  status: 'validado' | 'referencia' | 'requiere_calibracion';
  source?: string;
  confidence?: 'alta' | 'media' | 'estimada';
  target?: number;
  protocolReady?: boolean;
}

@Injectable()
export class AgrometeorologicalEngineService {
  private readonly logger = new Logger(AgrometeorologicalEngineService.name);
  private readonly procesosPorSiembra = new Map<
    string,
    Promise<{ indicadores: number; advertencias: string[] }>
  >();

  constructor(
    private repository: AgrometeorologiaRepository,
    private ingestion: WeatherIngestionService,
    private sensorOverlay?: SensorWeatherOverlayService,
  ) {}

  async procesarSiembra(
    idSiembra: string,
    options: { sincronizarClima?: boolean; forceBackfill?: boolean } = {},
  ): Promise<{ indicadores: number; advertencias: string[] }> {
    const key = String(idSiembra);
    const anterior =
      this.procesosPorSiembra.get(key) || Promise.resolve(undefined as any);
    let actual: Promise<{ indicadores: number; advertencias: string[] }>;
    actual = anterior
      .catch((error) => {
        this.logger.error(
          `El reproceso agrometeorologico anterior de ${key} fallo: ${error?.message || error}`,
        );
      })
      .then(() => this.procesarSiembraConLease(key, options))
      .finally(() => {
        if (this.procesosPorSiembra.get(key) === actual) {
          this.procesosPorSiembra.delete(key);
        }
      });
    this.procesosPorSiembra.set(key, actual);
    return await actual;
  }

  private async procesarSiembraConLease(
    idSiembra: string,
    options: { sincronizarClima?: boolean; forceBackfill?: boolean } = {},
  ): Promise<{ indicadores: number; advertencias: string[] }> {
    const generationId = randomUUID();
    await this.acquireGenerationLeaseWithRetry(idSiembra, generationId);
    try {
      const siembra = await this.repository.getSiembra(idSiembra);
      if (!siembra?._id || !siembra.fechaSiembra) {
        throw new Error(
          'La siembra no existe o no tiene fecha de implantacion.',
        );
      }
      const lote =
        siembra.lote ||
        (siembra.idLote
          ? await this.repository.getLote(siembra.idLote)
          : undefined);
      const establecimiento =
        siembra.establecimiento ||
        lote?.establecimiento ||
        (siembra.idEstablecimiento
          ? await this.repository.getEstablecimiento(siembra.idEstablecimiento)
          : lote?.idEstablecimiento
            ? await this.repository.getEstablecimiento(lote.idEstablecimiento)
            : undefined);
      if (!lote?._id || !establecimiento?._id) {
        throw new Error(
          'La siembra no tiene lote o establecimiento resoluble.',
        );
      }
      const cycleStart = this.resolveCycleStart(siembra);
      const coordinates = this.resolveCoordinates(
        siembra,
        lote,
        establecimiento,
      );
      if (!coordinates) {
        throw new Error(
          'El lote o establecimiento no tiene coordenadas validas.',
        );
      }
      const syncWarnings: string[] = [];
      if (cycleStart !== String(siembra.fechaSiembra).slice(0, 10)) {
        syncWarnings.push(
          `Cultivo perenne: se conserva la implantacion ${String(siembra.fechaSiembra).slice(0, 10)} y la campaña meteorologica vigente comienza ${cycleStart}.`,
        );
      }
      let expectedEndDate: string | undefined;
      if (options.sincronizarClima !== false) {
        const sync = await this.ingestion.sincronizar(
          establecimiento,
          coordinates,
          cycleStart,
          options.forceBackfill,
          String(lote._id),
        );
        syncWarnings.push(...sync.advertencias);
        expectedEndDate = sync.hasta;
      }
      let observations = await this.loadObservations(
        establecimiento._id,
        cycleStart,
        String(lote._id),
      );
      let fieldSourceContext: IFieldSourceContext | undefined;
      try {
        if (!this.sensorOverlay) {
          throw new Error('Integrador de sensores no configurado.');
        }
        const field = await this.sensorOverlay.overlay(
          lote,
          String(establecimiento._id),
          cycleStart,
          observations,
        );
        observations = field.observations;
        syncWarnings.push(...field.warnings);
        fieldSourceContext = {
          fieldObservations: field.fieldObservations,
          fieldCoverageByDate: field.fieldCoverageByDate,
          sensorNames: field.sensorNames,
          fieldTemperatureSensorNames: field.fieldTemperatureSensorNames,
          lastFieldObservationAt: field.lastFieldObservationAt,
          fieldTemperatureDecisionReady: field.fieldTemperatureDecisionReady,
          fieldTemperatureQuality: field.fieldTemperatureQuality,
          unqualifiedTemperatureSensorNames:
            field.unqualifiedTemperatureSensorNames,
        };
      } catch (error) {
        syncWarnings.push(
          'Los sensores de campo no pudieron integrarse en este reproceso; se mantuvo la jerarquia central/Open-Meteo.',
        );
        this.logger.warn(
          `Overlay de sensores no disponible para lote ${lote._id}: ${error?.message || error}`,
        );
      }
      let soilInputs: IEntradasAgronomicasSuelo | null = null;
      try {
        soilInputs = await this.repository.getSoilAgronomicInputs(lote._id);
      } catch (error) {
        syncWarnings.push(
          `Motor de suelo no disponible temporalmente; se conserva la lógica hídrica previa.`,
        );
        this.logger.warn(
          `Entradas edáficas no disponibles para lote ${lote._id}: ${error?.message || error}`,
        );
      }
      const calculated = this.calculateIndicators(
        siembra,
        lote,
        coordinates,
        observations,
        syncWarnings,
        soilInputs || undefined,
        fieldSourceContext,
        expectedEndDate,
      ).map((item) => ({
        ...item,
        generacionCalculo: generationId,
      }));
      if (!expectedEndDate) {
        expectedEndDate = calculated
          .map((item) => item.fecha)
          .sort()
          .reverse()[0];
      }
      if (!expectedEndDate) {
        throw new Error(
          'No hay una ventana meteorologica completa para activar el reproceso.',
        );
      }
      const expectedDates = this.calendarDateSequence(
        cycleStart,
        expectedEndDate,
      );
      const expectedInterval = {
        desde: cycleStart,
        hasta: expectedEndDate,
        cantidad: expectedDates.length,
        checksumFechas: this.generationDatesChecksum(
          String(siembra._id),
          AGROMET_ENGINE_VERSION,
          expectedDates,
        ),
      };
      const persistedGeneration =
        await this.repository.replaceIndicadoresGeneration(
          String(siembra._id),
          AGROMET_ENGINE_VERSION,
          generationId,
          calculated,
          expectedInterval,
        );
      if ((persistedGeneration as any)?.cleanupPending) {
        this.logger.warn(
          `La generacion ${generationId} quedo activa con mantenimiento pendiente ` +
            `(cleanup=${Boolean((persistedGeneration as any)?.cleanupPending)}).`,
        );
      }
      const warnings = [
        ...new Set(calculated.flatMap((item) => item.advertencias)),
      ];
      this.logger.log(
        JSON.stringify({
          event: 'agromet_sowing_processed',
          idSiembra,
          generationId,
          interval: expectedInterval,
          indicators: calculated.length,
          warnings: warnings.length,
          engineVersion: AGROMET_ENGINE_VERSION,
        }),
      );
      return { indicadores: calculated.length, advertencias: warnings };
    } finally {
      await this.repository
        .releaseIndicadoresGenerationLease(
          idSiembra,
          AGROMET_ENGINE_VERSION,
          generationId,
        )
        .catch((error) =>
          this.logger.error(
            `No se pudo liberar el lease agrometeorologico ${generationId} de ${idSiembra}: ${error?.message || error}`,
          ),
        );
    }
  }

  private async acquireGenerationLeaseWithRetry(
    idSiembra: string,
    generationId: string,
  ): Promise<void> {
    const delaysMs = [0, 250, 500, 1000, 2000, 4000];
    let lastError: unknown;
    for (const delayMs of delaysMs) {
      if (delayMs) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      try {
        await this.repository.acquireIndicadoresGenerationLease(
          idSiembra,
          AGROMET_ENGINE_VERSION,
          generationId,
        );
        return;
      } catch (error) {
        lastError = error;
        const status =
          Number(error?.status || error?.getStatus?.()) ||
          Number(error?.response?.status);
        const conflicto =
          status === 409 ||
          /reproceso agrometeorologico activo|adquirir el lease/i.test(
            String(error?.message || ''),
          );
        if (!conflicto) throw error;
      }
    }
    throw lastError;
  }

  /**
   * Separa la fecha historica de implantacion del inicio de la ventana
   * meteorologica. En perennes la implantacion define la edad del monte, pero
   * la serie se abre el 1 de mayo para no perder frio previo al 1 de julio.
   * La prediccion fenologica y sus biofix se resuelven por separado.
   */
  resolveCycleStart(siembra: ISiembra, referenceDate?: string): string {
    return this.resolveColdSeasonWindow(
      siembra,
      referenceDate ||
        this.localDateInTimezone(new Date(), DEFAULT_OPERATIONAL_TIMEZONE),
    ).start;
  }

  calculateIndicators(
    siembra: ISiembra,
    lote: ILote,
    coordinates: ICoordenadas,
    observations: IObservacionMeteorologicaNormalizada[],
    inheritedWarnings: string[] = [],
    soilInputs?: IEntradasAgronomicasSuelo,
    fieldSourceContext?: IFieldSourceContext,
    expectedEndDate?: string,
  ): ICreateIndicadorAgrometeorologico[] {
    const lotWithOriginalRootEvidence = lote;
    lote = aplicarEntradasAgronomicasSuelo(lote, soilInputs);
    const crop = siembra.semilla?.cultivo;
    const reference = crop
      ? PARAMETROS_AGROMETEOROLOGICOS_REFERENCIA[crop]
      : undefined;
    const custom = siembra.semilla?.parametrosAgrometeorologicos;
    const parameters: IParametrosAgrometeorologicos = {
      ...(reference || {
        version: AGROMET_DEFAULT_PARAMETERS_VERSION,
        estado: 'requiere_calibracion' as const,
      }),
      ...(custom || {}),
      temperaturaBaseC:
        custom?.temperaturaBaseC ??
        siembra.semilla?.fenologiaReferencia?.temperaturaBaseC ??
        reference?.temperaturaBaseC,
    };
    let coldRequirement: IColdRequirementResolution | undefined;
    const globalWarnings = [...inheritedWarnings];
    const receivedObservationCount = observations?.length || 0;
    observations = (observations || [])
      .map((observation) => this.resolveLotObservation(observation))
      .filter(
        (observation): observation is IObservacionMeteorologicaNormalizada =>
          !!observation,
      );
    if (observations.length !== receivedObservationCount) {
      globalWarnings.push(
        `Se descartaron ${receivedObservationCount - observations.length} observaciones meteorologicas con sobre incompleto; no se imputaron temperatura, frio ni GDD.`,
      );
    }
    if (fieldSourceContext?.fieldObservations) {
      const receivedFieldCount = fieldSourceContext.fieldObservations.length;
      fieldSourceContext = {
        ...fieldSourceContext,
        fieldObservations: fieldSourceContext.fieldObservations
          .map((observation) => this.resolveLotObservation(observation))
          .filter(
            (
              observation,
            ): observation is IObservacionMeteorologicaNormalizada =>
              !!observation,
          ),
      };
      if (fieldSourceContext.fieldObservations.length !== receivedFieldCount) {
        globalWarnings.push(
          `Se descartaron ${receivedFieldCount - fieldSourceContext.fieldObservations.length} lecturas de campo incompletas; no se usaron para frio ni decisiones biologicas.`,
        );
      }
    }
    if (!crop) globalWarnings.push('La siembra no tiene cultivo asociado.');
    if (!custom) {
      globalWarnings.push(
        'Se usan parametros agronomicos de referencia; calibrar Kc y umbrales para la variedad y el manejo local.',
      );
    }
    if (parameters.procesoTermico === 'dormancia_perenne') {
      globalWarnings.push(
        'La dormancia se informa con Horas de Frio 0-7,2 C, Unidades Utah y Porciones de Frio del Dynamic Model calculadas sobre la misma serie horaria canonica. Los tres modelos no son convertibles entre si.',
      );
    }
    if (
      parameters.procesoTermico === 'vernalizacion_anual' &&
      this.requiresVernalizationGate(parameters) &&
      !this.hasCalibratedVernalization(parameters)
    ) {
      globalWarnings.push(
        'La vernalizacion no se calcula: Trigo y Cebada requieren habito, modelo y requerimiento especificos de la variedad. El ciclo corto/intermedio/largo no demuestra respuesta vernalizante.',
      );
    }
    if (this.normalize(crop) === 'arveja') {
      globalWarnings.push(
        'Arveja se sigue como cultivo termico-fotoperiodico; no se presentan horas de frio de dormancia sin evidencia varietal especifica.',
      );
    }
    const forecastCutoff =
      Date.now() - AGROMETEO_FORECAST_MAX_AGE_HOURS * 3600000;
    const usableObservations = observations.filter(
      (item) =>
        !item.esPronostico ||
        new Date(item.obtenidoEn).getTime() >= forecastCutoff,
    );
    if (usableObservations.length < observations.length) {
      globalWarnings.push(
        'Se descartaron puntos de pronostico vencidos; se conservaron los historicos validos.',
      );
    }
    const dailyPersisted = usableObservations
      .filter((item) => item.granularidad === 'daily')
      .sort((a, b) => a.fechaLocal.localeCompare(b.fechaLocal));
    const hourlyByDate = this.groupHourlyByDate(usableObservations);
    const observedDates = [
      ...new Set([
        ...dailyPersisted.map((item) => item.fechaLocal),
        ...hourlyByDate.keys(),
      ]),
    ].sort();
    if (!observedDates.length) return [];
    const operationalTimezone =
      usableObservations.find((item) => item.timezone)?.timezone ||
      DEFAULT_OPERATIONAL_TIMEZONE;
    const operationalDate = this.resolveOperationalReferenceDate(
      usableObservations,
      operationalTimezone,
    );
    const coldWindow = this.resolveColdSeasonWindow(siembra, operationalDate);
    const dates = expectedEndDate
      ? this.calendarDateSequence(coldWindow.start, expectedEndDate)
      : observedDates;
    coldRequirement =
      parameters.procesoTermico === 'dormancia_perenne'
        ? this.resolveColdRequirement(siembra, coldWindow, fieldSourceContext)
        : undefined;
    if (parameters.procesoTermico === 'dormancia_perenne') {
      globalWarnings.push(...coldWindow.warnings);
      if (coldRequirement?.status !== 'validado') {
        globalWarnings.push(
          'El requisito varietal de frio no tiene modelo, fuente, region y protocolo estacional completamente validados. Chaman informa la acumulacion climatica, pero no declara cumplimiento biologico.',
        );
      }
    }
    const dailyByDate = new Map(
      dailyPersisted.map((item) => [item.fechaLocal, item]),
    );
    const profile = this.resolveSoilProfile(
      lote,
      parameters,
      soilInputs,
      lotWithOriginalRootEvidence,
    );
    if (profile.depthIsFallback) {
      globalWarnings.push(
        `La profundidad radicular no esta medida ni calibrada; se usa un fallback operativo conservador de ${profile.rootDepthCm} cm y nunca la profundidad total del perfil edafico.`,
      );
    }
    if (
      profile.effectiveDepthLimitCm !== undefined &&
      profile.effectiveDepthIsFallback
    ) {
      globalWarnings.push(
        `La profundidad efectiva edafica de ${profile.effectiveDepthLimitCm} cm es un fallback de screening y se usa solo como techo del calculo; no es una medicion de raices.`,
      );
    } else if (
      profile.effectiveDepthLimitCm !== undefined &&
      profile.limitedByEffectiveDepth
    ) {
      globalWarnings.push(
        `La zona de balance se limita a ${profile.rootDepthCm} cm por la profundidad efectiva edafica; ese limite no representa por si solo una profundidad radicular medida.`,
      );
    }
    if (
      profile.incompleteHydraulicCoverage &&
      profile.requestedRootDepthCm !== undefined
    ) {
      globalWarnings.push(
        `Cobertura hidraulica incompleta: el perfil verificable cubre ${profile.hydraulicDepthLimitCm ?? 0} de ${profile.requestedRootDepthCm} cm. No se extrapola la ultima capa ni se informa capacidad total de agua util.`,
      );
    }
    if (profile.pointSensorHydraulicsIgnored) {
      globalWarnings.push(
        'Las profundidades de sensores son puntos de medicion y no limites de horizontes; no se integran como un perfil hidraulico sin capas calibradas.',
      );
    }
    if (profile.potentialProfileCapacityIgnored) {
      globalWarnings.push(
        'La capacidad potencial del perfil es descriptiva y no se convierte en agua disponible de la zona radicular sin capas hidraulicas continuas hasta la profundidad de raices.',
      );
    }
    if (profile.legacyUniformHydraulicsIgnored) {
      globalWarnings.push(
        'Los valores escalares legacy de capacidad de campo y punto de marchitez no se integran como zona radicular sin una profundidad uniforme confirmada y sin sensores puntuales.',
      );
    }
    if (profile.hydraulicIsScreening) {
      globalWarnings.push(
        'La parametrizacion hidraulica es de screening; confirmar limites de horizontes, capacidad de campo y punto de marchitez para uso operativo.',
      );
    }
    if (
      profile.rootDepthCm !== undefined &&
      profile.hydraulicCoverageCm !== undefined &&
      profile.requestedRootDepthCm !== undefined &&
      profile.hydraulicCoverageCm + ROOT_ZONE_COVERAGE_TOLERANCE_CM <
        profile.requestedRootDepthCm
    ) {
      globalWarnings.push(
        `El perfil hidraulico cubre ${Number(profile.hydraulicCoverageCm.toFixed(1))} de ${profile.requestedRootDepthCm} cm de la zona objetivo.`,
      );
    }
    if (!profile.capacityMm) {
      globalWarnings.push(
        'Balance hidrico no calculable: faltan capacidad de campo, punto de marchitez o profundidad radicular.',
      );
    } else if (profile.estimated) {
      globalWarnings.push(
        profile.source === 'soil_intelligence'
          ? 'La capacidad de agua útil proviene del perfil edáfico estimado; validar con análisis o sensor cuando esté disponible.'
          : 'La capacidad de agua util usa una referencia del lote o cultivo y requiere validacion de perfil.',
      );
    }
    if (
      numeroFinito(siembra.aguaUtilReal) !== undefined &&
      !this.hasValidAvailableWaterState(siembra)
    ) {
      globalWarnings.push(
        'Se ignoro el agua util persistida porque su estado no representa un calculo valido; no se interpreta un cero sin sensor como medicion.',
      );
    }
    const irrigationByDate = this.resolveIrrigationEvents(siembra);
    if (!irrigationByDate.size) {
      globalWarnings.push(
        'No hay eventos de riego fechados; el balance se presenta como estimacion de secano y el riego diario queda sin dato.',
      );
    }
    globalWarnings.push(
      'El mojado foliar sin sensor es una estimacion ambiental y debe validarse a campo.',
    );

    let gddAccumulated = 0;
    let gddFromEmergence = 0;
    let gddStage = 0;
    let gddAccumulationComplete = true;
    let previousThermalObservationDate: string | undefined;
    let currentStage = '';
    let chillingAccumulated = 0;
    let utahChillAccumulated = 0;
    let chillPortionsAccumulated = 0;
    let fieldChillingAccumulated = 0;
    let fieldUtahChillAccumulated = 0;
    let fieldChillPortionsAccumulated = 0;
    let vernalizationAccumulated = 0;
    let radiationAccumulated = 0;
    let et0Accumulated = 0;
    let etcAccumulated = 0;
    let rainAccumulated = 0;
    let radiationAccumulationComplete = true;
    let et0AccumulationComplete = true;
    let rainAccumulationComplete = true;
    let rainyDays = 0;
    let dryDays = 0;
    let storage = this.initialStorageFromSowing(siembra, profile.capacityMm);
    let previousPhotoperiod: number | undefined;
    const emergenceDate = this.findEmergenceDate(siembra.registrosFenologicos);
    const rainfallHistory: Array<{ date: string; value?: number }> = [];
    const radiationHistory: Array<{ date: string; value?: number }> = [];
    const results: ICreateIndicadorAgrometeorologico[] = [];
    const cycleStart = coldWindow.start;
    const thermalStart = this.resolveThermalStart(siembra, operationalDate);
    if (esCultivoPerenne(crop)) {
      globalWarnings.push(
        thermalStart
          ? `En perennes el frio se acumula desde ${cycleStart}; los GDD de forzado comienzan ${thermalStart} por biofix de campo.`
          : `En perennes el frio se acumula desde ${cycleStart}; los GDD de forzado biologico quedan bloqueados hasta registrar un biofix de inicio de forzado. No se usa una fecha calendario generica para atravesar primavera, verano y dormancia.`,
      );
    }
    const coldThermal = this.calculateColdThermalSeries(
      usableObservations,
      coldWindow,
      parameters,
      this.resolveCoverageEndTimestamp(operationalTimezone, coldWindow.end),
    );
    globalWarnings.push(...coldThermal.warnings);
    const hasFieldAirTemperature =
      !!fieldSourceContext?.fieldObservations?.some(
        (item) =>
          item.granularidad === 'hourly' &&
          Number.isFinite(item.valores.temperatureC),
      );
    const fieldColdThermal = hasFieldAirTemperature
      ? this.calculateColdThermalSeries(
          fieldSourceContext?.fieldObservations || [],
          coldWindow,
          parameters,
          this.resolveCoverageEndTimestamp(operationalTimezone, coldWindow.end),
          true,
        )
      : { byDate: new Map<string, IDailyColdThermal>(), warnings: [] };
    if (fieldColdThermal.byDate.size) {
      globalWarnings.push(
        'El frio LoRa de campo se integra como fuente prioritaria en las horas observadas; central/Open-Meteo completa exclusivamente las horas faltantes.',
        ...fieldColdThermal.warnings.map(
          (warning) => `Serie LoRa de campo: ${warning}`,
        ),
      );
    }
    const vernalizationThermal = this.calculateVernalizationSeries(
      usableObservations,
      siembra,
      parameters,
      operationalDate,
      this.resolveCoverageEndTimestamp(operationalTimezone),
    );
    globalWarnings.push(...vernalizationThermal.warnings);

    for (const date of dates) {
      if (date < cycleStart) continue;
      const daily = dailyByDate.get(date);
      const hours = hourlyByDate.get(date) || [];
      const thermalActive = !!thermalStart && date >= thermalStart;
      const missingThermalDaysBeforeCurrent =
        thermalActive &&
        !!thermalStart &&
        (previousThermalObservationDate
          ? this.daysBetween(previousThermalObservationDate, date) > 1
          : date > thermalStart);
      if (missingThermalDaysBeforeCurrent) {
        gddAccumulationComplete = false;
      }
      const provisionalPhotoperiod =
        daily?.valores.daylightDurationHours ??
        calcularFotoperiodoHoras(date, coordinates.lat);
      const stageBeforeDailyGdd = this.resolveStage(
        siembra,
        date,
        gddAccumulationComplete ? gddAccumulated : Number.NaN,
        parameters,
        {
          vernalizationAccumulated,
          vernalizationCoverageSufficient:
            (vernalizationThermal.coveragePct ?? 0) >=
            MIN_VERNALIZATION_TEMPERATURE_COVERAGE_PCT,
          vernalizationContinuitySufficient:
            vernalizationThermal.continuitySufficient,
          photoperiodHours: provisionalPhotoperiod,
        },
      );
      const stageBeforeDailyGddProvenance = this.resolveStageProvenance(
        siembra,
        date,
        gddAccumulationComplete ? gddAccumulated : Number.NaN,
        parameters,
        {
          vernalizationAccumulated,
          vernalizationCoverageSufficient:
            (vernalizationThermal.coveragePct ?? 0) >=
            MIN_VERNALIZATION_TEMPERATURE_COVERAGE_PCT,
          vernalizationContinuitySufficient:
            vernalizationThermal.continuitySufficient,
          photoperiodHours: provisionalPhotoperiod,
        },
      );
      const stageBeforeDailyGddForDecisions = this.stageCanDriveDecisionModels(
        siembra,
        stageBeforeDailyGddProvenance,
      )
        ? stageBeforeDailyGdd
        : '';
      const thresholds = this.resolveThresholds(
        parameters,
        stageBeforeDailyGddForDecisions,
      );
      const derived = this.deriveHourlyDay(
        hours,
        thresholds,
        parameters,
        profile.requestedRootDepthCm ?? profile.rootDepthCm,
      );
      const mergedWeather = this.mergeDailyWeather(daily, derived);
      const weather = mergedWeather.values;
      const gdd =
        thermalActive &&
        mergedWeather.partialHourlyTemperatureCoverage === undefined
          ? calcularGdd({
              temperatureMinC: weather.temperatureMinC,
              temperatureMaxC: weather.temperatureMaxC,
              baseTemperatureC: parameters.temperaturaBaseC,
              upperTemperatureC: parameters.temperaturaSuperiorC,
            })
          : undefined;
      if (thermalActive && gdd === undefined) {
        gddAccumulationComplete = false;
      }
      if (gdd !== undefined && gddAccumulationComplete) {
        gddAccumulated += gdd;
        if (emergenceDate && date >= emergenceDate) gddFromEmergence += gdd;
      }
      if (thermalActive) previousThermalObservationDate = date;
      const photoperiod =
        weather.daylightDurationHours ??
        calcularFotoperiodoHoras(date, coordinates.lat);
      const solarTimes = this.solarTimes(date, coordinates, daily?.timezone);
      const coldDay = coldThermal.byDate.get(date);
      const chilling = coldDay?.chillingHours;
      const utahChill = coldDay?.utahChillUnits;
      const chillPortions = coldDay?.chillPortions;
      const fieldColdDay = fieldColdThermal.byDate.get(date);
      const fieldChilling = fieldColdDay?.chillingHours;
      const fieldUtahChill = fieldColdDay?.utahChillUnits;
      const fieldChillPortions = fieldColdDay?.chillPortions;
      const vernalizationDay = vernalizationThermal.byDate.get(date);
      const vernalization = vernalizationDay?.equivalentDays;
      const vernalizationTrackingActive = !!(
        vernalizationThermal.start &&
        date >= vernalizationThermal.start &&
        (!vernalizationThermal.end || date <= vernalizationThermal.end)
      );
      const vernalizationTrackingStarted = !!(
        vernalizationThermal.start && date >= vernalizationThermal.start
      );
      if (chilling !== undefined) chillingAccumulated += chilling;
      if (utahChill !== undefined) utahChillAccumulated += utahChill;
      if (chillPortions !== undefined)
        chillPortionsAccumulated += chillPortions;
      if (fieldChilling !== undefined)
        fieldChillingAccumulated += fieldChilling;
      if (fieldUtahChill !== undefined)
        fieldUtahChillAccumulated += fieldUtahChill;
      if (fieldChillPortions !== undefined)
        fieldChillPortionsAccumulated += fieldChillPortions;
      if (vernalization !== undefined)
        vernalizationAccumulated += vernalization;
      const thermalStageContext: IThermalStageContext = {
        vernalizationAccumulated,
        vernalizationCoverageSufficient:
          (vernalizationThermal.coveragePct ?? 0) >=
          MIN_VERNALIZATION_TEMPERATURE_COVERAGE_PCT,
        vernalizationContinuitySufficient:
          vernalizationThermal.continuitySufficient,
        photoperiodHours: photoperiod,
      };
      const stageGdd = gddAccumulationComplete ? gddAccumulated : Number.NaN;
      const stage = this.resolveStage(
        siembra,
        date,
        stageGdd,
        parameters,
        thermalStageContext,
      );
      const stageProvenance = this.resolveStageProvenance(
        siembra,
        date,
        stageGdd,
        parameters,
        thermalStageContext,
      );
      const thermalStageGate = this.hasValidatedVarietalThermalProfile(siembra)
        ? this.resolveThermalStageGate(
            parameters,
            stageGdd,
            thermalStageContext,
          )
        : undefined;
      if (stage !== currentStage && gddAccumulationComplete) {
        currentStage = stage;
        gddStage = gdd ?? 0;
      } else if (
        this.hasBiofixObjectiveOnDate(siembra, date, 'reinicio_gdd_etapa')
      ) {
        gddStage = gdd ?? 0;
      } else if (gdd !== undefined && gddAccumulationComplete) {
        gddStage += gdd;
      }

      const vpdMean =
        derived.vpdMeanKpa ??
        weather.vpdMeanKpa ??
        calcularVpdKpa(
          weather.temperatureMeanC,
          weather.relativeHumidityMeanPct,
        );
      const vpdMax = derived.vpdMaxKpa ?? weather.vpdMaxKpa;
      const dewPoint =
        weather.dewPointC ??
        derived.dewPointC ??
        calcularPuntoRocioC(
          weather.temperatureMeanC,
          weather.relativeHumidityMeanPct,
        );
      const radiation =
        weather.shortwaveRadiationMjM2 ?? derived.solarRadiationMjM2;
      if (radiation !== undefined) {
        radiationAccumulated += radiation;
      } else {
        radiationAccumulationComplete = false;
      }
      radiationHistory.push({ date, value: radiation });

      let et0 = weather.et0Mm ?? derived.et0Mm;
      let et0Source = daily?.fuentePorVariable.et0Mm;
      if (et0 === undefined) {
        et0 = calcularEt0Fao56({
          temperatureMinC: weather.temperatureMinC,
          temperatureMeanC: weather.temperatureMeanC,
          temperatureMaxC: weather.temperatureMaxC,
          relativeHumidityMinPct: weather.relativeHumidityMinPct,
          relativeHumidityMeanPct: weather.relativeHumidityMeanPct,
          relativeHumidityMaxPct: weather.relativeHumidityMaxPct,
          windSpeedMs: weather.windSpeedMs,
          windMeasurementHeightM: String(
            daily?.fuentePorVariable.windSpeedMs || '',
          ).includes('open_meteo')
            ? 10
            : 2,
          solarRadiationMjM2: radiation,
          latitude: coordinates.lat,
          elevationM: daily?.altitudM,
          dayOfYear: diaDelAnio(date),
        });
        if (et0 !== undefined)
          et0Source = this.derivedSource(
            daily?.fuente,
            derived.sourceByVariable,
          );
      }
      if (et0 !== undefined) {
        et0Accumulated += et0;
      } else {
        et0AccumulationComplete = false;
      }
      const stageCanDriveDecisionModels = this.stageCanDriveDecisionModels(
        siembra,
        stageProvenance,
      );
      const progress =
        esCultivoPerenne(siembra.semilla?.cultivo) &&
        !stageCanDriveDecisionModels
          ? undefined
          : this.cycleProgress(siembra, date);
      const kc = resolverKc(
        parameters,
        progress,
        stageCanDriveDecisionModels ? stage : undefined,
      );
      const etc = et0 !== undefined && kc !== undefined ? et0 * kc : undefined;
      if (etc !== undefined) etcAccumulated += etc;

      const precipitation = weather.precipitationMm ?? derived.precipitationMm;
      if (precipitation !== undefined) {
        rainAccumulated += precipitation;
        if (precipitation >= (parameters.umbralDiaLluviaMm ?? 0.2)) {
          rainyDays += 1;
          dryDays = 0;
        } else {
          dryDays += 1;
        }
      } else {
        rainAccumulationComplete = false;
      }
      rainfallHistory.push({ date, value: precipitation });
      const irrigation = irrigationByDate.get(date);

      const rootMoisture =
        derived.rootZoneSoilMoistureM3M3 ??
        this.rootZoneAverage(
          weather.soilMoistureM3M3,
          profile.requestedRootDepthCm ?? profile.rootDepthCm,
        );
      const rootTemperature =
        derived.rootZoneSoilTemperatureC ??
        this.rootZoneAverage(
          weather.soilTemperatureC,
          profile.requestedRootDepthCm ?? profile.rootDepthCm,
        );
      const incompleteRootZoneModelCoverage =
        this.hasIncompleteRootZoneCoverage(
          weather.soilMoistureM3M3,
          profile.requestedRootDepthCm ?? profile.rootDepthCm,
        ) ||
        this.hasIncompleteRootZoneCoverage(
          weather.soilTemperatureC,
          profile.requestedRootDepthCm ?? profile.rootDepthCm,
        );
      const measuredStorage = this.storageFromSoilMoisture(
        rootMoisture,
        profile,
      );
      if (measuredStorage !== undefined) storage = measuredStorage;
      const balance: ReturnType<typeof calcularBalanceHidrico> =
        precipitation === undefined
          ? { estimated: true }
          : calcularBalanceHidrico({
              previousStorageMm: storage,
              availableWaterCapacityMm: profile.capacityMm,
              precipitationMm: precipitation,
              irrigationMm: irrigation ?? 0,
              etcMm: etc,
              effectiveRainCoefficient:
                parameters.coeficientePrecipitacionEfectiva,
              runoffCoefficient: parameters.coeficienteEscurrimiento,
              drainageCoefficient: parameters.coeficienteDrenaje,
            });
      if (balance.storageMm !== undefined) storage = balance.storageMm;

      const dayWarnings = [...globalWarnings];
      if (thermalActive && gdd === undefined)
        dayWarnings.push(
          mergedWeather.partialHourlyTemperatureCoverage !== undefined
            ? 'GDD no acumulado: la temperatura diaria proviene de una serie horaria parcial.'
            : 'GDD no calculable: falta temperatura o temperatura base.',
        );
      if (kc === undefined)
        dayWarnings.push(
          'ETc no calculable: faltan parametros Kc para la etapa.',
        );
      if (
        esCultivoPerenne(siembra.semilla?.cultivo) &&
        !stageCanDriveDecisionModels
      ) {
        dayWarnings.push(
          'La etapa perenne de calendario se conserva solo como referencia visual. Hasta registrar un biofix o una etapa a campo no gobierna Kc, ETc ni umbrales de estres por etapa.',
        );
      }
      if (et0 === undefined)
        dayWarnings.push(
          'ET0 no disponible ni calculable con las variables existentes.',
        );
      if (daily && daily.completitudPct < 70) {
        dayWarnings.push('Cobertura meteorologica incompleta para este dia.');
      }
      if (
        mergedWeather.rejectedHigherPriorityTemperatureCoverage !== undefined
      ) {
        const rejected =
          mergedWeather.rejectedHigherPriorityTemperatureCoverage;
        dayWarnings.push(
          `La serie horaria canonica cubre ${Number(rejected.coveragePct.toFixed(1))}% del dia; aunque contiene temperatura de una fuente superior, no se uso para reconstruir minimas, medias, maximas ni GDD (minimo ${rejected.requiredPct}% para este reemplazo).`,
        );
      }
      if (mergedWeather.partialHourlyTemperatureCoverage !== undefined) {
        dayWarnings.push(
          `Las temperaturas diarias se reconstruyeron con ${Number(mergedWeather.partialHourlyTemperatureCoverage.toFixed(1))}% de cobertura horaria porque no habia un agregado diario completo. Se muestran como referencia parcial, pero no acumulan GDD ni desplazan la fenologia.`,
        );
      }
      if (thermalActive && !gddAccumulationComplete) {
        dayWarnings.push(
          'El acumulado GDD y la etapa termica automatica quedan bloqueados porque falta al menos un dia completo desde el inicio termico. El GDD diario disponible se conserva, pero no se publica una suma parcial como si fuera total.',
        );
      }
      for (const aggregate of mergedWeather.hourlyAggregateCoverage) {
        dayWarnings.push(this.hourlyAggregateCoverageWarning(aggregate));
      }
      if (precipitation === undefined) {
        dayWarnings.push(
          'Balance hidrico no actualizado: falta un total diario completo de precipitacion y el sistema no presume lluvia cero.',
        );
      }
      if (
        parameters.procesoTermico === 'dormancia_perenne' &&
        coldDay &&
        coldDay.coveragePct < MIN_COLD_TEMPERATURE_COVERAGE_PCT
      ) {
        dayWarnings.push(
          `Cobertura horaria acumulada de temperatura ${Number(coldDay.coveragePct.toFixed(1))}% para el calculo de frio; interpretar los acumulados con cautela y no completar las horas faltantes por interpolacion.`,
        );
      }
      if (incompleteRootZoneModelCoverage) {
        dayWarnings.push(
          'Las capas meteorologicas de suelo no cubren de forma contigua toda la zona radicular; no se informa un promedio radicular parcial.',
        );
      }
      if (thermalStageGate === 'vernalizacion_sin_calibrar') {
        dayWarnings.push(
          'La etapa por GDD no se usa como prediccion automatica: el cereal no tiene habito, ventana, requisito y fuente de vernalizacion completamente validados.',
        );
      } else if (thermalStageGate === 'vernalizacion_pendiente') {
        dayWarnings.push(
          'Gate fenologico conservador v1: el GDD crudo se conserva, pero la etapa no cruza el final de la fase sensible hasta cumplir vernalizacion con cobertura y continuidad suficientes.',
        );
      } else if (thermalStageGate === 'fotoperiodo_incompatible') {
        dayWarnings.push(
          'Gate fenologico conservador v1: el GDD crudo se conserva, pero la etapa no avanza mientras el umbral fotoperiodico varietal validado sea incompatible.',
        );
      }
      const soilModelSource = derived.sourceByVariable.soilMoistureM3M3;
      if (
        rootMoisture !== undefined &&
        soilModelSource === 'derived_open_meteo'
      ) {
        dayWarnings.push(
          'La humedad y temperatura del suelo provienen del modelo de suelo Open-Meteo por capas; no son una medicion con sonda en el lote.',
        );
      } else if (rootMoisture !== undefined && soilModelSource === 'mixed') {
        dayWarnings.push(
          'La humedad del suelo combina sensores disponibles con capas modeladas de Open-Meteo; revisar la fuente por variable.',
        );
      }
      const metrics: IMetricasAgrometeorologicasDiarias = {
        temperatureMinC: weather.temperatureMinC,
        temperatureMeanC: weather.temperatureMeanC,
        temperatureMaxC: weather.temperatureMaxC,
        coldHours: derived.coldHours,
        heatHours: derived.heatHours,
        frostDay:
          weather.temperatureMinC !== undefined
            ? weather.temperatureMinC <= 0
            : undefined,
        thermalStressDay:
          derived.heatHours !== undefined
            ? derived.heatHours > 0
            : weather.temperatureMaxC !== undefined
              ? weather.temperatureMaxC >= thresholds.heatC
              : undefined,
        gddDaily: gdd,
        gddAccumulated:
          thermalActive && gddAccumulationComplete ? gddAccumulated : undefined,
        gddAccumulationComplete: thermalActive
          ? gddAccumulationComplete
          : undefined,
        gddBaseTemperatureC: parameters.temperaturaBaseC,
        gddUpperTemperatureC: parameters.temperaturaSuperiorC,
        gddFromEmergence:
          thermalActive && emergenceDate && gddAccumulationComplete
            ? gddFromEmergence
            : undefined,
        gddCurrentStage:
          thermalActive && gddAccumulationComplete ? gddStage : undefined,
        photoperiodHours: photoperiod,
        photoperiodChangeMinutes:
          photoperiod !== undefined && previousPhotoperiod !== undefined
            ? (photoperiod - previousPhotoperiod) * 60
            : undefined,
        sunrise: weather.sunrise || solarTimes.sunrise,
        sunset: weather.sunset || solarTimes.sunset,
        chillingHours: chilling,
        chillingHoursAccumulated:
          chilling !== undefined ? chillingAccumulated : undefined,
        chillingTemperatureCoveragePct: coldDay?.coveragePct,
        chillingMaximumGapHours: coldThermal.maximumGapHours,
        chillingContinuitySufficient: coldThermal.continuitySufficient,
        utahChillUnits: utahChill,
        utahChillUnitsAccumulated:
          utahChill !== undefined ? utahChillAccumulated : undefined,
        chillPortions,
        chillPortionsAccumulated:
          chillPortions !== undefined ? chillPortionsAccumulated : undefined,
        fieldChillingHours: fieldChilling,
        fieldChillingHoursAccumulated: fieldColdDay
          ? fieldChillingAccumulated
          : undefined,
        fieldUtahChillUnits: fieldUtahChill,
        fieldUtahChillUnitsAccumulated: fieldColdDay
          ? fieldUtahChillAccumulated
          : undefined,
        fieldChillPortions,
        fieldChillPortionsAccumulated: fieldColdDay
          ? fieldChillPortionsAccumulated
          : undefined,
        fieldChillingTemperatureCoveragePct: fieldColdDay?.coveragePct,
        fieldChillingMaximumGapHours: fieldColdThermal.maximumGapHours,
        fieldChillingContinuitySufficient:
          fieldColdThermal.continuitySufficient,
        vernalizationUnits: vernalization,
        vernalizationAccumulated: vernalizationTrackingStarted
          ? vernalizationAccumulated
          : undefined,
        vernalizationTemperatureCoveragePct: vernalizationThermal.coveragePct,
        vernalizationMaximumGapHours: vernalizationThermal.maximumGapHours,
        vernalizationContinuitySufficient:
          vernalizationThermal.continuitySufficient,
        vernalizationWindowActive: vernalizationTrackingActive,
        photoperiodCompatible: this.resolvePhotoperiodCompatibility(
          parameters,
          stage,
          photoperiod,
        ),
        relativeHumidityMinPct: weather.relativeHumidityMinPct,
        relativeHumidityMeanPct: weather.relativeHumidityMeanPct,
        relativeHumidityMaxPct: weather.relativeHumidityMaxPct,
        dewPointC: dewPoint,
        vpdMeanKpa: vpdMean,
        vpdMaxKpa: vpdMax,
        vpdStressHours: derived.vpdStressHours,
        solarRadiationMjM2: radiation,
        solarRadiationAccumulatedMjM2:
          radiation !== undefined && radiationAccumulationComplete
            ? radiationAccumulated
            : undefined,
        sunshineDurationHours: weather.sunshineDurationHours,
        radiationRollingMean7d: this.rollingMean(radiationHistory, date, 7),
        et0Mm: et0,
        et0AccumulatedMm:
          et0 !== undefined && et0AccumulationComplete
            ? et0Accumulated
            : undefined,
        kc,
        etcMm: etc,
        etcAccumulatedMm: etc !== undefined ? etcAccumulated : undefined,
        precipitationMm: precipitation,
        effectivePrecipitationMm: balance.effectivePrecipitationMm,
        irrigationMm: irrigation,
        runoffMm: balance.runoffMm,
        deepDrainageMm: balance.deepDrainageMm,
        soilWaterStorageMm: balance.storageMm,
        availableWaterCapacityMm: profile.capacityMm,
        availableWaterPercentage: balance.availableWaterPercentage,
        waterDeficitMm: balance.waterDeficitMm,
        waterStressIndex: balance.waterStressIndex,
        fieldTemperatureCoveragePct:
          fieldSourceContext?.fieldCoverageByDate.get(date),
        rainAccumulatedMm:
          precipitation !== undefined && rainAccumulationComplete
            ? rainAccumulated
            : undefined,
        rain7dMm: this.rollingSum(rainfallHistory, date, 7),
        rain15dMm: this.rollingSum(rainfallHistory, date, 15),
        rain30dMm: this.rollingSum(rainfallHistory, date, 30),
        rainyDaysAccumulated:
          precipitation !== undefined && rainAccumulationComplete
            ? rainyDays
            : undefined,
        consecutiveDryDays:
          precipitation !== undefined && rainAccumulationComplete
            ? dryDays
            : undefined,
        maxHourlyRainMm: derived.maxHourlyRainMm,
        leafWetnessHours: derived.leafWetnessHours,
        maxContinuousLeafWetnessHours: derived.maxContinuousLeafWetnessHours,
        meanTemperatureDuringLeafWetnessC:
          derived.meanTemperatureDuringLeafWetnessC,
        rootZoneSoilTemperatureC: rootTemperature,
        rootZoneSoilMoistureM3M3: rootMoisture,
        soilTemperatureC: derived.soilTemperatureC || weather.soilTemperatureC,
        soilMoistureM3M3: derived.soilMoistureM3M3 || weather.soilMoistureM3M3,
      };
      if (photoperiod !== undefined) previousPhotoperiod = photoperiod;
      const sourceByVariable = { ...mergedWeather.sourceByVariable };
      if (et0Source) sourceByVariable.et0Mm = et0Source;
      results.push({
        idSiembra: String(siembra._id),
        idLote: String(lote._id),
        idEstablecimiento: String(
          lote.idEstablecimiento || siembra.idEstablecimiento,
        ),
        idQuimica: siembra.idQuimica || lote.idQuimica,
        idDistribuidor: siembra.idDistribuidor || lote.idDistribuidor,
        idProductor: siembra.idProductor || lote.idProductor,
        fecha: date,
        esPronostico:
          this.observationContainsForecast(daily) ||
          hours.some((item) => this.observationContainsForecast(item)),
        etapaFenologica: stage || undefined,
        fuenteEtapaFenologica: stageProvenance.source,
        confianzaEtapaFenologica: stageProvenance.confidence,
        versionModeloFenologico: stageProvenance.modelVersion,
        metricas: metrics,
        fuente: this.resolveOverallSource(daily?.fuente, sourceByVariable),
        fuentePorVariable: sourceByVariable,
        banderasCalidad: [
          ...new Set([
            ...(daily?.banderasCalidad || []),
            ...hours.flatMap((item) => item.banderasCalidad),
            ...(balance.estimated ? ['estimated_water_balance'] : []),
            ...(derived.leafWetnessHours !== undefined
              ? ['estimated_leaf_wetness']
              : []),
            ...(soilModelSource === 'derived_open_meteo'
              ? ['modeled_soil_open_meteo']
              : []),
            ...(soilModelSource === 'mixed' ? ['mixed_soil_sources'] : []),
            ...(profile.depthIsFallback ? ['screening_root_depth'] : []),
            ...(profile.effectiveDepthIsFallback
              ? ['screening_effective_soil_depth']
              : []),
            ...(profile.incompleteHydraulicCoverage
              ? ['incomplete_hydraulic_root_zone']
              : []),
            ...(profile.hydraulicIsScreening
              ? ['screening_hydraulic_profile']
              : []),
            ...(profile.pointSensorHydraulicsIgnored
              ? ['point_sensor_not_hydraulic_profile']
              : []),
            ...(profile.potentialProfileCapacityIgnored
              ? ['potential_profile_capacity_not_root_zone']
              : []),
            ...(profile.legacyUniformHydraulicsIgnored
              ? ['legacy_uniform_hydraulics_not_root_zone']
              : []),
            ...(incompleteRootZoneModelCoverage
              ? ['incomplete_root_zone_model_coverage']
              : []),
            ...(parameters.procesoTermico === 'dormancia_perenne' &&
            coldDay &&
            coldDay.coveragePct < MIN_COLD_TEMPERATURE_COVERAGE_PCT
              ? ['low_chilling_temperature_coverage']
              : []),
            ...(thermalStageGate
              ? [`thermal_stage_gate:${thermalStageGate}`]
              : []),
            ...(thermalActive && !gddAccumulationComplete
              ? ['incomplete_gdd_accumulation']
              : []),
            ...(mergedWeather.rejectedHigherPriorityTemperatureCoverage !==
            undefined
              ? ['insufficient_hourly_temperature_coverage_for_daily_aggregate']
              : []),
            ...(mergedWeather.partialHourlyTemperatureCoverage !== undefined
              ? ['partial_hourly_daily_temperature']
              : []),
            ...mergedWeather.hourlyAggregateCoverage.map((item) =>
              this.hourlyAggregateCoverageFlag(item),
            ),
            ...(profile.depthIsFallback ||
            (profile.depthSource === 'crop_parameter' &&
              profile.depthConfidence === 'low') ||
            profile.effectiveDepthIsFallback ||
            profile.hydraulicIsScreening
              ? ['screening_water_balance']
              : []),
          ]),
        ],
        advertencias: [...new Set(dayWarnings)],
        completitudPct: this.completenessForIndicator(metrics),
        coberturaCampoPct: fieldSourceContext?.fieldCoverageByDate.get(date),
        ultimaObservacionCampo: fieldSourceContext?.lastFieldObservationAt,
        calidadTemperaturaCampo: fieldSourceContext?.fieldTemperatureQuality
          ? 'calificado'
          : undefined,
        nombresSensoresTemperaturaCampo:
          fieldSourceContext?.fieldTemperatureSensorNames,
        procesoTermico: parameters.procesoTermico,
        estadoParametros: parameters.estado,
        fuenteParametros: parameters.fuente,
        modeloVernalizacion: parameters.modeloVernalizacion,
        habitoVernalizacion: parameters.habitoVernalizacion,
        requerimientoVernalizacion: parameters.requerimientoVernalizacion,
        estadoVernalizacion: parameters.estadoVernalizacion,
        inicioVentanaFrio:
          parameters.procesoTermico === 'dormancia_perenne'
            ? cycleStart
            : undefined,
        inicioVentanaVernalizacion: vernalizationThermal.start,
        finVentanaVernalizacion: vernalizationThermal.end,
        ...(coldRequirement
          ? {
              modeloFrioRector: coldRequirement.model,
              estadoRequerimientoFrio: coldRequirement.status,
              fuenteRequerimientoFrio: coldRequirement.source,
              confianzaRequerimientoFrio: coldRequirement.confidence,
              objetivoFrioRector: coldRequirement.target,
            }
          : {}),
        versionCalculo: AGROMET_ENGINE_VERSION,
        versionParametros:
          parameters.version || AGROMET_DEFAULT_PARAMETERS_VERSION,
        calculadoEn: new Date().toISOString(),
      });
    }
    return results;
  }

  async getResponse(
    idSiembra: string,
    from?: string,
    to?: string,
  ): Promise<IRespuestaAgrometeorologiaSiembra> {
    const filter: Record<string, unknown> = {
      idSiembra,
      versionCalculo: AGROMET_ENGINE_VERSION,
    };
    if (from || to) {
      filter.fecha = {
        ...(from ? { $gte: from.slice(0, 10) } : {}),
        ...(to ? { $lte: to.slice(0, 10) } : {}),
      };
    }
    let indicators: {
      datos?: IIndicadorAgrometeorologicoDiario[];
    } = { datos: [] };
    let resolvedCalculationVersion = AGROMET_ENGINE_VERSION;
    try {
      if (
        typeof (this.repository as any).getActiveIndicadoresGeneration !==
        'function'
      ) {
        throw new TypeError('active-generation-repository-unavailable');
      }
      const active = await this.repository.getActiveIndicadoresGeneration(
        idSiembra,
        AGROMET_ENGINE_VERSION,
      );
      indicators = active?.generationId
        ? { datos: active.data || [] }
        : { datos: [] };
    } catch (error) {
      if (error?.message !== 'active-generation-repository-unavailable') {
        this.logger.warn(
          `No se pudo resolver la generacion activa de ${idSiembra}; se conserva la ultima version estable sin mezclar filas preparatorias: ${error?.message || error}`,
        );
      }
      indicators = { datos: [] };
    }
    if (!(indicators.datos || []).length) {
      const legacyFilter = {
        ...filter,
        versionCalculo: LEGACY_AGROMET_ENGINE_VERSION,
      };
      const legacyIndicators = await this.repository.getIndicadores({
        filter: JSON.stringify(legacyFilter),
        sort: 'fecha',
        limit: 0,
      });
      if ((legacyIndicators.datos || []).length) {
        indicators = legacyIndicators;
        resolvedCalculationVersion = LEGACY_AGROMET_ENGINE_VERSION;
      }
    }
    const indicatorForecastCutoff =
      Date.now() - AGROMETEO_FORECAST_MAX_AGE_HOURS * 3600000;
    const rows = (indicators.datos || [])
      .filter(
        (item) =>
          (!from || item.fecha >= from.slice(0, 10)) &&
          (!to || item.fecha <= to.slice(0, 10)),
      )
      .filter(
        (item) =>
          !item.esPronostico ||
          new Date(item.calculadoEn).getTime() >= indicatorForecastCutoff,
      )
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (!rows.length) {
      return {
        summary: {},
        dataSource: {
          type: 'sin_datos',
          completenessPercentage: 0,
        },
        series: [],
        warnings: [
          'El motor automatico todavia no genero resultados para esta siembra.',
        ],
        calculationVersion: AGROMET_ENGINE_VERSION,
        parametersVersion: AGROMET_DEFAULT_PARAMETERS_VERSION,
      };
    }
    const establishmentId = rows[0].idEstablecimiento;
    const observations = await this.repository.getObservaciones({
      filter: JSON.stringify({
        idEstablecimiento: establishmentId,
        granularidad: 'daily',
        fechaLocal: {
          $gte: rows[0].fecha,
          $lte: rows[rows.length - 1].fecha,
        },
      }),
      sort: 'timestamp',
      limit: 0,
    });
    const lotObservations = (observations.datos || [])
      .map((item) => this.resolveLotObservation(item, rows[0].idLote))
      .filter((item): item is IObservacionMeteorologicaNormalizada => !!item);
    const weatherByDate = new Map(
      lotObservations.map((item) => [item.fechaLocal, item]),
    );
    const series: ISerieAgrometeorologicaDia[] = rows.map((item) => {
      const weather = weatherByDate.get(item.fecha);
      return {
        date: item.fecha,
        isForecast: item.esPronostico,
        stage: item.etapaFenologica,
        stageSource: item.fuenteEtapaFenologica,
        stageConfidence: item.confianzaEtapaFenologica,
        phenologyModelVersion: item.versionModeloFenologico,
        weather: weather?.valores || {},
        metrics: item.metricas,
        source: item.fuente,
        sourceByVariable: item.fuentePorVariable,
        qualityFlags: item.banderasCalidad,
        warnings: item.advertencias,
      };
    });
    const responseTimezone =
      lotObservations.find((item) => item.timezone)?.timezone ||
      DEFAULT_OPERATIONAL_TIMEZONE;
    const today = this.localDateInTimezone(new Date(), responseTimezone);
    const latestObserved =
      [...rows]
        .reverse()
        .find((item) => !item.esPronostico && item.fecha <= today) || rows[0];
    const current = rows.find((item) => item.fecha === today) || latestObserved;
    const stationNames = lotObservations
      .map((item) => item.estacionNombre)
      .filter((value): value is string => !!value);
    const normalizedSources = new Set<'sensor' | 'station' | 'open_meteo'>();
    for (const item of rows) {
      const sources = [
        item.fuente,
        ...Object.values(item.fuentePorVariable || {}),
      ];
      if (sources.some((source) => String(source || '').includes('sensor'))) {
        normalizedSources.add('sensor');
      }
      if (sources.some((source) => String(source || '').includes('station'))) {
        normalizedSources.add('station');
      }
      if (
        sources.some(
          (source) =>
            String(source || '').includes('open_meteo') ||
            source === 'gap_filled',
        )
      ) {
        normalizedSources.add('open_meteo');
      }
    }
    const dataSourceType =
      normalizedSources.size > 1
        ? 'mixed'
        : normalizedSources.has('sensor')
          ? 'sensor'
          : normalizedSources.has('station')
            ? 'station'
            : 'open_meteo';
    const fieldCoverageRows = rows
      .filter((item) => !item.esPronostico)
      .map((item) => item.coberturaCampoPct)
      .filter((value): value is number => Number.isFinite(value));
    const sensorNames = [
      ...new Set(
        rows
          .flatMap((item) => item.banderasCalidad || [])
          .filter((flag) => flag.startsWith('sensor:'))
          .map((flag) => flag.slice('sensor:'.length).trim())
          .filter(Boolean),
      ),
    ];
    const lastFieldObservationAt = rows
      .map((item) => item.ultimaObservacionCampo)
      .filter((value): value is string => !!value)
      .sort()
      .reverse()[0];
    const recordedFieldTemperatureQuality = [...rows]
      .reverse()
      .find((item) => !!item.calidadTemperaturaCampo)?.calidadTemperaturaCampo;
    // Compatibilidad con series persistidas antes del cambio de jerarquia:
    // toda temperatura LoRa asignada al lote es operativa, aunque una fila
    // historica conserve la etiqueta legacy "referencia".
    const fieldTemperatureQuality = recordedFieldTemperatureQuality
      ? ('calificado' as const)
      : undefined;
    const fieldTemperatureSensorNames = [
      ...new Set(
        rows
          .flatMap((item) => item.nombresSensoresTemperaturaCampo || [])
          .filter(Boolean),
      ),
    ];
    const coldSeasonStart =
      [...rows].reverse().find((item) => !!item.inicioVentanaFrio)
        ?.inicioVentanaFrio ||
      rows.find(
        (item) =>
          item.metricas.chillingHours !== undefined ||
          item.metricas.chillPortions !== undefined,
      )?.fecha;
    const coldThrough = [...rows]
      .reverse()
      .find(
        (item) =>
          !item.esPronostico &&
          (item.metricas.chillingHoursAccumulated !== undefined ||
            item.metricas.chillPortionsAccumulated !== undefined),
      );
    const fieldColdThrough = [...rows]
      .reverse()
      .find(
        (item) =>
          !item.esPronostico &&
          item.metricas.fieldChillingTemperatureCoveragePct !== undefined,
      );
    const fieldCold =
      fieldColdThrough && fieldTemperatureQuality
        ? {
            quality: 'qualified' as const,
            sensorNames: fieldTemperatureSensorNames.length
              ? fieldTemperatureSensorNames
              : sensorNames.length
                ? sensorNames
                : undefined,
            throughDate: fieldColdThrough.fecha,
            lastObservationAt: lastFieldObservationAt,
            modelVersion: FRIO_TERMICO_ENGINE_VERSION,
            chillingHoursAccumulated:
              fieldColdThrough.metricas.fieldChillingHoursAccumulated,
            utahChillUnitsAccumulated:
              fieldColdThrough.metricas.fieldUtahChillUnitsAccumulated,
            chillPortionsAccumulated:
              fieldColdThrough.metricas.fieldChillPortionsAccumulated,
            temperatureCoveragePercentage:
              fieldColdThrough.metricas.fieldChillingTemperatureCoveragePct,
            maximumGapHours:
              fieldColdThrough.metricas.fieldChillingMaximumGapHours,
            continuitySufficient:
              fieldColdThrough.metricas.fieldChillingContinuitySufficient,
            interpretation:
              (fieldColdThrough.metricas.fieldChillingTemperatureCoveragePct ??
                0) >= MIN_COLD_TEMPERATURE_COVERAGE_PCT &&
              fieldColdThrough.metricas.fieldChillingContinuitySufficient ===
                true
                ? ('qualified' as const)
                : ('insufficient_data' as const),
          }
        : undefined;
    const coldRequirement =
      latestObserved.procesoTermico === 'dormancia_perenne'
        ? this.buildColdRequirementSummary(coldThrough || latestObserved)
        : undefined;
    const vernalizationStart =
      [...rows].reverse().find((item) => !!item.inicioVentanaVernalizacion)
        ?.inicioVentanaVernalizacion ||
      rows.find((item) => item.metricas.vernalizationWindowActive === true)
        ?.fecha;
    const lastVernalizationActive = [...rows]
      .reverse()
      .find((item) => item.metricas.vernalizationWindowActive === true);
    const lastVernalizationTracked = [...rows]
      .reverse()
      .find(
        (item) =>
          item.metricas.vernalizationAccumulated !== undefined ||
          item.metricas.vernalizationTemperatureCoveragePct !== undefined,
      );
    const vernalizationEnd =
      [...rows].reverse().find((item) => !!item.finVentanaVernalizacion)
        ?.finVentanaVernalizacion ||
      (lastVernalizationActive &&
      latestObserved.fecha > lastVernalizationActive.fecha
        ? lastVernalizationActive.fecha
        : undefined);
    const vernalizationInterpretation: IRespuestaAgrometeorologiaSiembra['summary']['vernalizationInterpretation'] =
      latestObserved.procesoTermico !== 'vernalizacion_anual'
        ? undefined
        : latestObserved.habitoVernalizacion === 'primaveral' &&
            latestObserved.estadoVernalizacion === 'validado' &&
            latestObserved.requerimientoVernalizacion === 0
          ? 'no_requerida'
          : latestObserved.estadoVernalizacion !== 'validado'
            ? 'sin_calibrar'
            : !vernalizationStart
              ? 'sin_biofix_inicio'
              : (lastVernalizationTracked?.metricas
                    .vernalizationTemperatureCoveragePct ?? 0) <
                    MIN_VERNALIZATION_TEMPERATURE_COVERAGE_PCT ||
                  lastVernalizationTracked?.metricas
                    .vernalizationContinuitySufficient !== true
                ? 'datos_insuficientes'
                : vernalizationEnd
                  ? 'ventana_cerrada'
                  : 'en_acumulacion';
    const gddAccumulationComplete =
      latestObserved.metricas.gddAccumulationComplete !== false &&
      latestObserved.metricas.gddAccumulated !== undefined;
    return {
      summary: {
        gddAccumulated: latestObserved.metricas.gddAccumulated,
        gddAccumulationComplete,
        gddThroughDate: gddAccumulationComplete
          ? latestObserved.fecha
          : undefined,
        gddBaseTemperatureC: latestObserved.metricas.gddBaseTemperatureC,
        gddUpperTemperatureC: latestObserved.metricas.gddUpperTemperatureC,
        rainAccumulatedMm: latestObserved.metricas.rainAccumulatedMm,
        et0AccumulatedMm: latestObserved.metricas.et0AccumulatedMm,
        etcAccumulatedMm: latestObserved.metricas.etcAccumulatedMm,
        availableWaterPercentage:
          latestObserved.metricas.availableWaterPercentage,
        waterDeficitMm: latestObserved.metricas.waterDeficitMm,
        vpdMeanKpa: current.metricas.vpdMeanKpa,
        currentPhotoperiodHours: current.metricas.photoperiodHours,
        thermalProcess: latestObserved.procesoTermico,
        parametersStatus: latestObserved.estadoParametros,
        parametersSource: latestObserved.fuenteParametros,
        vernalizationModel: latestObserved.modeloVernalizacion,
        vernalizationHabit: latestObserved.habitoVernalizacion,
        vernalizationRequirement: latestObserved.requerimientoVernalizacion,
        vernalizationStatus: latestObserved.estadoVernalizacion,
        vernalizationWindowStart: vernalizationStart,
        vernalizationWindowEnd: vernalizationEnd,
        vernalizationTemperatureCoveragePct:
          lastVernalizationTracked?.metricas
            .vernalizationTemperatureCoveragePct,
        vernalizationMaximumGapHours:
          lastVernalizationTracked?.metricas.vernalizationMaximumGapHours,
        vernalizationContinuitySufficient:
          lastVernalizationTracked?.metricas.vernalizationContinuitySufficient,
        vernalizationInterpretation,
        coldSeasonStart,
        coldThroughDate: coldThrough?.fecha,
        coldModelVersion:
          coldThrough?.metricas.chillingHoursAccumulated !== undefined
            ? FRIO_TERMICO_ENGINE_VERSION
            : undefined,
        chillingTemperatureCoveragePct:
          coldThrough?.metricas.chillingTemperatureCoveragePct,
        chillingMaximumGapHours: coldThrough?.metricas.chillingMaximumGapHours,
        chillingContinuitySufficient:
          coldThrough?.metricas.chillingContinuitySufficient,
        chillingHoursAccumulated:
          coldThrough?.metricas.chillingHoursAccumulated,
        utahChillUnitsAccumulated:
          coldThrough?.metricas.utahChillUnitsAccumulated,
        chillPortionsAccumulated:
          coldThrough?.metricas.chillPortionsAccumulated,
        fieldCold,
        vernalizationAccumulated:
          lastVernalizationTracked?.metricas.vernalizationAccumulated,
        coldRequirement,
      },
      dataSource: {
        type: dataSourceType,
        sources: [...normalizedSources],
        stationName: stationNames[0],
        lastObservationAt:
          lastFieldObservationAt ||
          lotObservations
            .filter((item) => !item.esPronostico)
            .map((item) => item.timestamp)
            .sort()
            .reverse()[0],
        lastCalculatedAt: rows
          .map((item) => item.calculadoEn)
          .sort()
          .reverse()[0],
        completenessPercentage:
          rows.reduce((sum, item) => sum + item.completitudPct, 0) /
          rows.length,
        fieldCoveragePercentage: fieldCoverageRows.length
          ? fieldCoverageRows.reduce((sum, value) => sum + value, 0) /
            fieldCoverageRows.length
          : undefined,
        sensorNames: sensorNames.length ? sensorNames : undefined,
        fieldTemperatureQuality: fieldTemperatureQuality
          ? 'qualified'
          : undefined,
      },
      series,
      warnings: [
        ...new Set([
          ...rows.flatMap((item) => item.advertencias),
          ...(resolvedCalculationVersion !== AGROMET_ENGINE_VERSION
            ? [
                'Se conserva temporalmente la ultima serie meteorologica estable mientras finaliza el reproceso del motor actualizado.',
              ]
            : []),
        ]),
      ],
      calculationVersion: resolvedCalculationVersion,
      parametersVersion: current.versionParametros,
    };
  }

  private resolveColdSeasonWindow(
    siembra: ISiembra,
    referenceDate: string,
  ): IColdSeasonWindow {
    const implantationDate = String(siembra.fechaSiembra || '').slice(0, 10);
    if (!esCultivoPerenne(siembra.semilla?.cultivo)) {
      return {
        start: implantationDate,
        comparisonReady: true,
        usedFallback: false,
        warnings: [],
      };
    }

    const fallback = this.perennialColdSeasonStart(referenceDate);
    const protocol = siembra.semilla?.requerimientoFrio?.protocoloTemporada;
    const warnings: string[] = [];
    const seasonalBiofixSearchStart = `${fallback.slice(0, 4)}-01-01`;
    const startBiofix = this.biofixDateForObjective(
      siembra,
      'inicio_acumulacion_frio',
      seasonalBiofixSearchStart,
      referenceDate,
    );
    const protocolStart =
      protocol?.inicio?.tipo === 'fecha_calendario' &&
      protocol.estado !== 'requiere_calibracion'
        ? this.calendarStartForReference(protocol.inicio.mesDia, referenceDate)
        : undefined;
    let start = startBiofix || protocolStart || fallback;
    if (implantationDate && implantationDate > start) {
      start = implantationDate;
    }

    const endBiofix = this.biofixDateForObjective(
      siembra,
      'fin_acumulacion_frio',
      start,
      referenceDate,
    );
    const protocolEnd =
      protocol?.fin?.tipo === 'fecha_calendario' &&
      protocol.estado !== 'requiere_calibracion'
        ? this.calendarEndAfterStart(protocol.fin.mesDia, start)
        : undefined;
    const endCandidate = endBiofix || protocolEnd;
    const end =
      endCandidate && endCandidate >= start && endCandidate <= referenceDate
        ? endCandidate
        : undefined;
    const protocolStartReady =
      protocol?.inicio?.tipo === 'fecha_calendario'
        ? !!protocolStart
        : !!startBiofix;
    const protocolMetadataReady = !!(
      protocol &&
      protocol.estado === 'validado' &&
      String(protocol.version || '').trim() &&
      String(protocol.fuente || '').trim() &&
      String(protocol.region || '').trim() &&
      protocol.inicio &&
      protocol.fin
    );
    const comparisonReady = protocolMetadataReady && protocolStartReady;
    const usedFallback = !startBiofix && !protocolStart;

    if (startBiofix) {
      warnings.push(
        `La ventana de frio comienza ${start} por biofix de campo.`,
      );
    } else if (protocolStart) {
      warnings.push(
        `La ventana de frio comienza ${start} por protocolo estacional ${protocol?.estado}.`,
      );
    } else {
      warnings.push(
        `El 1 de mayo (${fallback}) se usa solo como referencia meteorologica porque no hay biofix ni protocolo estacional aplicable.`,
      );
    }
    if (protocol?.fin?.tipo === 'biofix' && !endBiofix) {
      warnings.push(
        'La ventana de frio permanece abierta hasta registrar el biofix de fin de acumulacion.',
      );
    }
    if (!comparisonReady) {
      warnings.push(
        'La acumulacion de frio es auditable, pero la comparacion varietal queda bloqueada hasta validar fuente, region, ventana y biofix requerido por el protocolo.',
      );
    }

    return {
      start,
      end,
      comparisonReady,
      usedFallback,
      warnings,
    };
  }

  private biofixDateForObjective(
    siembra: ISiembra,
    objective: string,
    from: string,
    to: string,
  ): string | undefined {
    return this.activePhenologyRecords(siembra.registrosFenologicos)
      .filter(
        (record) =>
          record.tipoEvento === 'biofix' &&
          this.phenologyRecordCanDriveDecision(record) &&
          (record.objetivosBiofix || []).some(
            (item) => String(item) === objective,
          ),
      )
      .map((record) =>
        String(
          record.fechaInicioEtapa ||
            record.fechaObservacion ||
            record.fecha ||
            '',
        ).slice(0, 10),
      )
      .filter((date) => !!date && date >= from && date <= to)
      .sort()
      .pop();
  }

  private calendarStartForReference(
    monthDay: string,
    referenceDate: string,
  ): string | undefined {
    if (!this.isValidMonthDay(monthDay)) return undefined;
    const referenceYear = Number(referenceDate.slice(0, 4));
    if (!Number.isFinite(referenceYear)) return undefined;
    let candidate = `${referenceYear}-${monthDay}`;
    if (candidate > referenceDate)
      candidate = `${referenceYear - 1}-${monthDay}`;
    return candidate;
  }

  private calendarEndAfterStart(
    monthDay: string,
    start: string,
  ): string | undefined {
    if (!this.isValidMonthDay(monthDay)) return undefined;
    const startYear = Number(start.slice(0, 4));
    if (!Number.isFinite(startYear)) return undefined;
    let candidate = `${startYear}-${monthDay}`;
    if (candidate < start) candidate = `${startYear + 1}-${monthDay}`;
    return candidate;
  }

  private isValidMonthDay(value?: string): boolean {
    if (!/^\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const [month, day] = String(value).split('-').map(Number);
    const date = new Date(Date.UTC(2000, month - 1, day));
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  private calculateColdThermalSeries(
    observations: IObservacionMeteorologicaNormalizada[],
    windowOrStart: IColdSeasonWindow | string,
    parameters: IParametrosAgrometeorologicos,
    coverageEndTimestamp?: string,
    allowReferenceFieldTemperature = false,
  ): IColdThermalSeries {
    const window: IColdSeasonWindow =
      typeof windowOrStart === 'string'
        ? {
            start: windowOrStart,
            comparisonReady: false,
            usedFallback: true,
            warnings: [],
          }
        : windowOrStart;
    if (parameters.procesoTermico !== 'dormancia_perenne') {
      return { byDate: new Map(), warnings: [] };
    }
    const hourly = observations
      .filter(
        (item) =>
          item.granularidad === 'hourly' &&
          (allowReferenceFieldTemperature
            ? this.isObservedFieldTemperature(item)
            : this.isObservedDecisionTemperature(item)) &&
          item.fechaLocal >= window.start &&
          (!window.end || item.fechaLocal <= window.end) &&
          Number.isFinite(item.valores.temperatureC),
      )
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (!hourly.length) {
      return {
        byDate: new Map(),
        continuitySufficient: false,
        warnings: [
          allowReferenceFieldTemperature
            ? 'Frio de campo no calculable: no hay temperatura horaria de aire medida por sensores desde el inicio de la temporada.'
            : 'Frio de dormancia no calculable: no hay temperatura horaria canonica desde el inicio de la temporada.',
        ],
      };
    }
    const lastTimestamp =
      coverageEndTimestamp || hourly[hourly.length - 1].timestamp;
    const timezone =
      hourly.find((item) => item.timezone)?.timezone ||
      DEFAULT_OPERATIONAL_TIMEZONE;
    const firstTimestamp =
      this.firstHourlySlotForLocalDate(window.start, timezone) ||
      `${window.start}T00:00:00-03:00`;
    const result = calcularFrioTermico(
      hourly.map((item) => ({
        fecha: item.timestamp,
        temperaturaC: item.valores.temperatureC,
        fuente: this.temperatureSourceForCold(item),
        calidad: String(
          item.fuentePorVariable.temperatureC || item.fuente,
        ).includes('open_meteo')
          ? ('estimada' as const)
          : ('observada' as const),
      })),
      {
        fechaInicio: firstTimestamp,
        fechaFin: lastTimestamp,
        zonaHoraria: timezone,
        desfaseHorarioMinutos: -180,
        prioridadFuentes: ['sensor', 'station', 'open_meteo'],
        coberturaMinimaPct: MIN_COLD_TEMPERATURE_COVERAGE_PCT,
        reiniciarPrecursorEnBrecha: true,
      },
    );
    const maximumGapHours = result.continuidad.mayorBrechaHoras;
    const continuitySufficient =
      maximumGapHours <= MAX_COLD_CONTINUOUS_GAP_HOURS;
    let expectedHoursToDate = 0;
    let observedHoursToDate = 0;
    const byDate = new Map<string, IDailyColdThermal>();
    for (const day of result.porDia) {
      expectedHoursToDate += day.horasEsperadas;
      observedHoursToDate += day.horasConDato;
      byDate.set(day.dia, {
        chillingHours: day.horasConDato > 0 ? day.horasFrio : undefined,
        utahChillUnits: day.horasConDato > 0 ? day.unidadesFrioUtah : undefined,
        chillPortions:
          day.horasConDato > 0 ? day.porcionesFrioDinamicas : undefined,
        dailyCoveragePct: day.coberturaPct,
        coveragePct:
          expectedHoursToDate > 0
            ? (observedHoursToDate / expectedHoursToDate) * 100
            : 0,
        hoursWithData: day.horasConDato,
      });
    }
    return {
      byDate,
      maximumGapHours,
      continuitySufficient,
      warnings: [
        ...result.diagnostico.advertencias.map(
          (warning) => `Motor de frio ${result.versionMotor}: ${warning}`,
        ),
        ...(maximumGapHours > 0
          ? [
              `Motor de frio ${result.versionMotor}: las Porciones de Frio se informan como cota inferior conservadora porque el precursor del Dynamic Model se reinicia ante cada brecha horaria no completada explicitamente por otra fuente trazable.`,
            ]
          : []),
        ...(continuitySufficient
          ? []
          : [
              `Motor de frio ${result.versionMotor}: la mayor brecha continua es de ${maximumGapHours} h y supera el maximo operativo de ${MAX_COLD_CONTINUOUS_GAP_HOURS} h; los acumulados quedan auditables pero no habilitan compatibilidad varietal.`,
            ]),
      ],
    };
  }

  private calculateVernalizationSeries(
    observations: IObservacionMeteorologicaNormalizada[],
    siembra: ISiembra,
    parameters: IParametrosAgrometeorologicos,
    referenceDate: string,
    coverageEndTimestamp?: string,
  ): IVernalizationSeries {
    if (
      parameters.procesoTermico !== 'vernalizacion_anual' ||
      parameters.habitoVernalizacion === 'primaveral' ||
      !this.hasCalibratedVernalization(parameters)
    ) {
      return { byDate: new Map(), warnings: [] };
    }
    const window = this.resolveVernalizationWindow(
      siembra,
      parameters,
      referenceDate,
    );
    if (!window.start) {
      return {
        byDate: new Map(),
        end: window.end,
        warnings: [
          `La exposicion termica de vernalizacion no se acumula: falta registrar el inicio de la etapa ${parameters.ventanaVernalizacion?.inicioEtapa || 'configurada'} mediante inicio de etapa o biofix de campo.`,
        ],
      };
    }

    const hourly = observations
      .filter(
        (item) =>
          item.granularidad === 'hourly' &&
          this.isObservedDecisionTemperature(item) &&
          item.fechaLocal >= window.start! &&
          (!window.end || item.fechaLocal <= window.end) &&
          Number.isFinite(item.valores.temperatureC),
      )
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (!hourly.length) {
      return {
        byDate: new Map(),
        start: window.start,
        end: window.end,
        coveragePct: 0,
        continuitySufficient: false,
        warnings: [
          'La ventana fenologica de vernalizacion esta identificada, pero no tiene temperatura horaria canonica observada.',
        ],
      };
    }

    const timezone =
      hourly.find((item) => item.timezone)?.timezone ||
      DEFAULT_OPERATIONAL_TIMEZONE;
    const firstTimestamp =
      this.firstHourlySlotForLocalDate(window.start, timezone) ||
      `${window.start}T00:00:00-03:00`;
    const result = calcularFrioTermico(
      hourly.map((item) => ({
        fecha: item.timestamp,
        temperaturaC: item.valores.temperatureC,
        fuente: this.temperatureSourceForCold(item),
        calidad: String(
          item.fuentePorVariable.temperatureC || item.fuente,
        ).includes('open_meteo')
          ? ('estimada' as const)
          : ('observada' as const),
      })),
      {
        fechaInicio: firstTimestamp,
        fechaFin: coverageEndTimestamp || hourly[hourly.length - 1].timestamp,
        zonaHoraria: timezone,
        desfaseHorarioMinutos: -180,
        prioridadFuentes: ['sensor', 'station', 'open_meteo'],
        coberturaMinimaPct: MIN_VERNALIZATION_TEMPERATURE_COVERAGE_PCT,
        reiniciarPrecursorEnBrecha: true,
      },
    );
    const range = parameters.rangoVernalizacionC!;
    const byDayContributions = new Map<string, number>();
    for (const hour of result.horas) {
      if (hour.temperaturaC >= range.min && hour.temperaturaC <= range.max) {
        byDayContributions.set(
          hour.dia,
          (byDayContributions.get(hour.dia) || 0) + 1,
        );
      }
    }
    const byDate = new Map<string, IDailyVernalization>();
    for (const day of result.porDia) {
      const dailyComplete =
        day.coberturaPct >= MIN_DAILY_VERNALIZATION_COVERAGE_PCT;
      byDate.set(day.dia, {
        equivalentDays: dailyComplete
          ? (byDayContributions.get(day.dia) || 0) / day.horasEsperadas
          : undefined,
        coveragePct: day.coberturaPct,
        windowActive: true,
      });
    }
    const maximumGapHours = result.continuidad.mayorBrechaHoras;
    const coveragePct = result.continuidad.coberturaPct;
    const continuitySufficient =
      coveragePct >= MIN_VERNALIZATION_TEMPERATURE_COVERAGE_PCT &&
      maximumGapHours <= MAX_VERNALIZATION_CONTINUOUS_GAP_HOURS;
    const warnings = [
      ...result.diagnostico.advertencias.map(
        (warning) =>
          `Exposicion termica de vernalizacion ${result.versionMotor}: ${warning}`,
      ),
      ...(coveragePct < MIN_VERNALIZATION_TEMPERATURE_COVERAGE_PCT
        ? [
            `La ventana de vernalizacion tiene ${Number(coveragePct.toFixed(1))}% de cobertura horaria y requiere al menos ${MIN_VERNALIZATION_TEMPERATURE_COVERAGE_PCT}% para una interpretacion; los dias incompletos no aportan unidades.`,
          ]
        : []),
      ...(maximumGapHours > MAX_VERNALIZATION_CONTINUOUS_GAP_HOURS
        ? [
            `La mayor brecha de temperatura en vernalizacion es ${maximumGapHours} h y supera el maximo operativo de ${MAX_VERNALIZATION_CONTINUOUS_GAP_HOURS} h.`,
          ]
        : []),
      ...(window.end
        ? [
            `La ventana de exposicion termica se cerro ${window.end} por registro de campo de ${parameters.ventanaVernalizacion?.finEtapa}.`,
          ]
        : []),
    ];
    return {
      byDate,
      warnings,
      start: window.start,
      end: window.end,
      coveragePct,
      maximumGapHours,
      continuitySufficient,
    };
  }

  private resolveVernalizationWindow(
    siembra: ISiembra,
    parameters: IParametrosAgrometeorologicos,
    referenceDate: string,
  ): { start?: string; end?: string } {
    const configured = parameters.ventanaVernalizacion;
    if (!configured) return {};
    const sowingDate = String(siembra.fechaSiembra || '').slice(0, 10);
    const resolveStageDate = (stage: string): string | undefined => {
      const normalizedStage = this.normalize(stage);
      if (normalizedStage === 'siembra') {
        return sowingDate || undefined;
      }
      return this.activePhenologyRecords(siembra.registrosFenologicos)
        .filter(
          (record) =>
            record.tipoEvento !== 'observacion' &&
            record.accion !== 'observacion' &&
            this.phenologyRecordCanDriveDecision(record) &&
            this.normalize(record.etapa) === normalizedStage,
        )
        .map((record) =>
          String(
            record.fechaInicioEtapa ||
              record.fechaObservacion ||
              record.fecha ||
              '',
          ).slice(0, 10),
        )
        .filter(
          (date) =>
            !!date &&
            (!sowingDate || date >= sowingDate) &&
            date <= referenceDate,
        )
        .sort()[0];
    };
    const startBiofix = this.biofixDateForObjective(
      siembra,
      'inicio_vernalizacion',
      sowingDate || '1900-01-01',
      referenceDate,
    );
    const start = startBiofix || resolveStageDate(configured.inicioEtapa);
    const endBiofix = start
      ? this.biofixDateForObjective(
          siembra,
          'fin_vernalizacion',
          start,
          referenceDate,
        )
      : undefined;
    const endCandidate = endBiofix || resolveStageDate(configured.finEtapa);
    return {
      start,
      end:
        start && endCandidate && endCandidate >= start
          ? endCandidate
          : undefined,
    };
  }

  private temperatureSourceForCold(
    observation: IObservacionMeteorologicaNormalizada,
  ): 'sensor' | 'station' | 'open_meteo' {
    const source = String(
      observation.fuentePorVariable.temperatureC || observation.fuente || '',
    );
    if (source.includes('sensor')) return 'sensor';
    if (source.includes('station')) return 'station';
    return 'open_meteo';
  }

  private resolveColdRequirement(
    siembra: ISiembra,
    window: IColdSeasonWindow,
    fieldSourceContext?: IFieldSourceContext,
  ): IColdRequirementResolution {
    const requirement = siembra.semilla?.requerimientoFrio;
    const protocol = requirement?.protocoloTemporada;
    const source = String(requirement?.fuente || '').trim() || undefined;
    const requestedModel = requirement?.modeloRector;
    const target =
      requestedModel === 'HF'
        ? numeroFinito(requirement?.horasFrio)
        : requestedModel === 'CP'
          ? numeroFinito(requirement?.porcionesFrio)
          : undefined;
    const valid =
      requirement?.estado === 'validado' &&
      (requestedModel === 'HF' || requestedModel === 'CP') &&
      target !== undefined &&
      target > 0 &&
      !!source &&
      protocol?.estado === 'validado' &&
      !!String(protocol.version || '').trim() &&
      !!String(protocol.fuente || '').trim() &&
      !!String(protocol.region || '').trim() &&
      window.comparisonReady;

    if (!valid) {
      return {
        model: 'sin_calibrar',
        status:
          requirement?.estado === 'referencia'
            ? 'referencia'
            : 'requiere_calibracion',
        source,
        confidence: requirement?.confianza,
        protocolReady: window.comparisonReady,
      };
    }

    return {
      model: requestedModel,
      status: 'validado',
      source,
      confidence: requirement?.confianza,
      target,
      protocolReady: true,
    };
  }

  private buildColdRequirementSummary(
    indicator: IIndicadorAgrometeorologicoDiario,
  ): IRespuestaAgrometeorologiaSiembra['summary']['coldRequirement'] {
    const model = indicator.modeloFrioRector || 'sin_calibrar';
    const status = indicator.estadoRequerimientoFrio || 'requiere_calibracion';
    const target = numeroFinito(indicator.objetivoFrioRector);
    const accumulated =
      model === 'HF'
        ? numeroFinito(indicator.metricas.chillingHoursAccumulated)
        : model === 'CP'
          ? numeroFinito(indicator.metricas.chillPortionsAccumulated)
          : undefined;
    const coveragePercentage = numeroFinito(
      indicator.metricas.chillingTemperatureCoveragePct,
    );
    const coverageSufficient =
      coveragePercentage !== undefined &&
      coveragePercentage >= MIN_COLD_TEMPERATURE_COVERAGE_PCT;
    const maximumGapHours = numeroFinito(
      indicator.metricas.chillingMaximumGapHours,
    );
    const continuitySufficient =
      indicator.metricas.chillingContinuitySufficient === true &&
      maximumGapHours !== undefined &&
      maximumGapHours <= MAX_COLD_CONTINUOUS_GAP_HOURS;
    const hasValidatedRequirement =
      status === 'validado' &&
      model !== 'sin_calibrar' &&
      target !== undefined &&
      target > 0;
    const canCompare =
      hasValidatedRequirement &&
      accumulated !== undefined &&
      coverageSufficient &&
      continuitySufficient;
    const progressPercentage = canCompare
      ? clamp((accumulated / target) * 100, 0, 200)
      : undefined;
    const compatible =
      progressPercentage !== undefined && progressPercentage >= 100;

    return {
      model,
      status,
      source: indicator.fuenteRequerimientoFrio,
      confidence: indicator.confianzaRequerimientoFrio,
      target: hasValidatedRequirement ? target : undefined,
      accumulated:
        hasValidatedRequirement && accumulated !== undefined
          ? accumulated
          : undefined,
      progressPercentage,
      compatible: canCompare ? compatible : undefined,
      coveragePercentage,
      minimumCoveragePercentage: MIN_COLD_TEMPERATURE_COVERAGE_PCT,
      coverageSufficient,
      maximumGapHours,
      maximumAllowedGapHours: MAX_COLD_CONTINUOUS_GAP_HOURS,
      continuitySufficient,
      interpretation: !hasValidatedRequirement
        ? 'sin_calibrar'
        : !coverageSufficient ||
            !continuitySufficient ||
            accumulated === undefined
          ? 'datos_insuficientes'
          : compatible
            ? 'compatible_requiere_confirmacion'
            : 'en_acumulacion',
    };
  }

  private hasCalibratedVernalization(
    parameters: IParametrosAgrometeorologicos,
  ): boolean {
    const documentedSpringHabit =
      parameters.procesoTermico === 'vernalizacion_anual' &&
      parameters.habitoVernalizacion === 'primaveral' &&
      parameters.estadoVernalizacion === 'validado' &&
      parameters.requerimientoVernalizacion === 0 &&
      !!String(parameters.fuenteVernalizacion || '').trim();
    if (documentedSpringHabit) return true;
    const range = parameters.rangoVernalizacionC;
    return !!(
      parameters.procesoTermico === 'vernalizacion_anual' &&
      parameters.estadoVernalizacion === 'validado' &&
      range &&
      Number.isFinite(range.min) &&
      Number.isFinite(range.max) &&
      range.max > range.min &&
      Number.isFinite(parameters.requerimientoVernalizacion) &&
      Number(parameters.requerimientoVernalizacion) > 0 &&
      parameters.modeloVernalizacion === 'ventana_calibrada' &&
      parameters.habitoVernalizacion &&
      parameters.habitoVernalizacion !== 'desconocido' &&
      String(parameters.fuenteVernalizacion || '').trim() &&
      String(parameters.ventanaVernalizacion?.inicioEtapa || '').trim() &&
      String(parameters.ventanaVernalizacion?.finEtapa || '').trim() &&
      parameters.ventanaVernalizacion?.unidad === 'dias_equivalentes'
    );
  }

  private deriveHourlyDay(
    hours: IObservacionMeteorologicaNormalizada[],
    thresholds: { coldC: number; heatC: number; vpdKpa: number },
    parameters: IParametrosAgrometeorologicos,
    rootDepthCm?: number,
  ): IDailyDerived {
    const decisionTemperatureHours = hours.filter((item) =>
      this.isDecisionTemperature(item),
    );
    const decisionHumidityHours = hours.filter((item) =>
      this.isDecisionHumidity(item),
    );
    const temperatures = this.values(decisionTemperatureHours, 'temperatureC');
    const humidity = this.values(decisionHumidityHours, 'relativeHumidityPct');
    const precipitation = this.values(hours, 'precipitationMm');
    const vpdValues = hours
      .map((item) => {
        if (
          this.isDecisionHumidityDerivedVariable(item, 'vpdKpa') &&
          esNumeroFinito(item.valores.vpdKpa)
        ) {
          return item.valores.vpdKpa;
        }
        return this.isDecisionTemperature(item) && this.isDecisionHumidity(item)
          ? calcularVpdKpa(
              item.valores.temperatureC,
              item.valores.relativeHumidityPct,
            )
          : undefined;
      })
      .filter((value): value is number => esNumeroFinito(value));
    const dewPoints = hours
      .map((item) => {
        if (
          this.isDecisionHumidityDerivedVariable(item, 'dewPointC') &&
          esNumeroFinito(item.valores.dewPointC)
        ) {
          return item.valores.dewPointC;
        }
        return this.isDecisionTemperature(item) && this.isDecisionHumidity(item)
          ? calcularPuntoRocioC(
              item.valores.temperatureC,
              item.valores.relativeHumidityPct,
            )
          : undefined;
      })
      .filter((value): value is number => esNumeroFinito(value));
    const wetnessInputs = hours.map((item) => ({
      temperatureC: this.isDecisionTemperature(item)
        ? item.valores.temperatureC
        : undefined,
      relativeHumidityPct: this.isDecisionHumidity(item)
        ? item.valores.relativeHumidityPct
        : undefined,
      dewPointC: this.isDecisionHumidityDerivedVariable(item, 'dewPointC')
        ? item.valores.dewPointC
        : undefined,
      precipitationMm: item.valores.precipitationMm,
    }));
    const hasWetnessEvidence = wetnessInputs.some(
      (item) =>
        esNumeroFinito(item.precipitationMm) ||
        (esNumeroFinito(item.relativeHumidityPct) &&
          (esNumeroFinito(item.temperatureC) ||
            esNumeroFinito(item.dewPointC))),
    );
    const wetness = hasWetnessEvidence
      ? calcularMojadoFoliarEstimado(wetnessInputs)
      : { estimated: true };
    const radiation = this.values(hours, 'shortwaveRadiationWm2');
    const et0Hourly = this.values(hours, 'et0Mm');
    const soilTemperature = this.averageLayerMaps(
      hours.map((item) => item.valores.soilTemperatureC),
    );
    const soilMoisture = this.averageLayerMaps(
      hours.map((item) => item.valores.soilMoistureM3M3),
    );
    const sourceByVariable: IDailyDerived['sourceByVariable'] = {};
    const tempSource = this.derivedSourceFromHours(
      decisionTemperatureHours,
      'temperatureC',
    );
    const humiditySource = this.derivedSourceFromHours(
      decisionHumidityHours,
      'relativeHumidityPct',
    );
    const rainSource = this.derivedSourceFromHours(hours, 'precipitationMm');
    const radiationSource = this.derivedSourceFromHours(
      hours,
      'shortwaveRadiationWm2',
    );
    const et0Source = this.derivedSourceFromHours(hours, 'et0Mm');
    const soilTemperatureSource = this.derivedSourceFromHours(
      hours,
      'soilTemperatureC',
    );
    const soilMoistureSource = this.derivedSourceFromHours(
      hours,
      'soilMoistureM3M3',
    );
    const temperatureHourlyCoveragePct = this.hourlyCoveragePct(
      decisionTemperatureHours,
      'temperatureC',
    );
    const humidityHourlyCoveragePct = decisionHumidityHours.length
      ? (this.hourlyCoveragePct(decisionHumidityHours, 'relativeHumidityPct') ??
        0)
      : undefined;
    const precipitationHourlyCoveragePct = hours.length
      ? (this.hourlyCoveragePct(hours, 'precipitationMm') ?? 0)
      : undefined;
    const radiationHourlyCoveragePct = hours.length
      ? (this.hourlyCoveragePct(hours, 'shortwaveRadiationWm2') ?? 0)
      : undefined;
    const et0HourlyCoveragePct = hours.length
      ? (this.hourlyCoveragePct(hours, 'et0Mm') ?? 0)
      : undefined;
    const humidityAccepted =
      humidityHourlyCoveragePct !== undefined &&
      humidityHourlyCoveragePct >= MIN_DAILY_HUMIDITY_HOURLY_COVERAGE_PCT;
    const precipitationAccepted =
      precipitationHourlyCoveragePct !== undefined &&
      precipitationHourlyCoveragePct >= MIN_DAILY_TOTAL_HOURLY_COVERAGE_PCT;
    const radiationAccepted =
      radiationHourlyCoveragePct !== undefined &&
      radiationHourlyCoveragePct >= MIN_DAILY_TOTAL_HOURLY_COVERAGE_PCT;
    const et0Accepted =
      et0HourlyCoveragePct !== undefined &&
      et0HourlyCoveragePct >= MIN_DAILY_TOTAL_HOURLY_COVERAGE_PCT;
    const hourlyAggregateCoverage: IHourlyAggregateCoverage[] = [];
    const registerCoverage = (
      metric: DailyHourlyAggregate,
      coveragePct: number | undefined,
      requiredPct: number,
      accepted: boolean,
    ) => {
      if (coveragePct === undefined || coveragePct >= 100) return;
      hourlyAggregateCoverage.push({
        metric,
        coveragePct,
        requiredPct,
        accepted,
      });
    };
    registerCoverage(
      'humidity',
      humidityHourlyCoveragePct,
      MIN_DAILY_HUMIDITY_HOURLY_COVERAGE_PCT,
      humidityAccepted,
    );
    registerCoverage(
      'precipitation',
      precipitationHourlyCoveragePct,
      MIN_DAILY_TOTAL_HOURLY_COVERAGE_PCT,
      precipitationAccepted,
    );
    registerCoverage(
      'radiation',
      radiationHourlyCoveragePct,
      MIN_DAILY_TOTAL_HOURLY_COVERAGE_PCT,
      radiationAccepted,
    );
    registerCoverage(
      'et0',
      et0HourlyCoveragePct,
      MIN_DAILY_TOTAL_HOURLY_COVERAGE_PCT,
      et0Accepted,
    );
    const temperatureHighestSourcePriority =
      this.highestSourcePriorityFromHours(
        decisionTemperatureHours,
        'temperatureC',
      );
    if (tempSource) {
      sourceByVariable.temperatureMinC = tempSource;
      sourceByVariable.temperatureMeanC = tempSource;
      sourceByVariable.temperatureMaxC = tempSource;
    }
    if (humiditySource && humidityAccepted) {
      sourceByVariable.relativeHumidityMinPct = humiditySource;
      sourceByVariable.relativeHumidityMeanPct = humiditySource;
      sourceByVariable.relativeHumidityMaxPct = humiditySource;
    }
    if (rainSource && precipitationAccepted)
      sourceByVariable.precipitationMm = rainSource;
    if (radiationSource && radiationAccepted)
      sourceByVariable.shortwaveRadiationMjM2 = radiationSource;
    if (et0Source && et0Accepted) sourceByVariable.et0Mm = et0Source;
    if (soilTemperature && soilTemperatureSource)
      sourceByVariable.soilTemperatureC = soilTemperatureSource;
    if (soilMoisture && soilMoistureSource)
      sourceByVariable.soilMoistureM3M3 = soilMoistureSource;
    if (vpdValues.length && humidityAccepted)
      sourceByVariable.vpdMeanKpa = this.combineDerivedSources(
        tempSource,
        humiditySource,
      );
    return {
      temperatureMinC: this.min(temperatures),
      temperatureMeanC: this.mean(temperatures),
      temperatureMaxC: this.max(temperatures),
      humidityMinPct: humidityAccepted ? this.min(humidity) : undefined,
      humidityMeanPct: humidityAccepted ? this.mean(humidity) : undefined,
      humidityMaxPct: humidityAccepted ? this.max(humidity) : undefined,
      dewPointC: humidityAccepted ? this.mean(dewPoints) : undefined,
      precipitationMm:
        precipitationAccepted && precipitation.length
          ? this.sum(precipitation)
          : undefined,
      maxHourlyRainMm: this.max(precipitation),
      vpdMeanKpa: humidityAccepted ? this.mean(vpdValues) : undefined,
      vpdMaxKpa: humidityAccepted ? this.max(vpdValues) : undefined,
      coldHours: temperatures.length
        ? temperatures.filter((value) => value < thresholds.coldC).length
        : undefined,
      heatHours: temperatures.length
        ? temperatures.filter((value) => value > thresholds.heatC).length
        : undefined,
      vpdStressHours: vpdValues.length
        ? humidityAccepted
          ? vpdValues.filter((value) => value > thresholds.vpdKpa).length
          : undefined
        : undefined,
      chillingHours:
        parameters.procesoTermico === 'dormancia_perenne' && temperatures.length
          ? temperatures.filter((value) => value >= 0 && value <= 7.2).length
          : undefined,
      leafWetnessHours:
        hasWetnessEvidence && (humidityAccepted || precipitationAccepted)
          ? wetness.hours
          : undefined,
      maxContinuousLeafWetnessHours:
        hasWetnessEvidence && (humidityAccepted || precipitationAccepted)
          ? wetness.maxContinuousHours
          : undefined,
      meanTemperatureDuringLeafWetnessC:
        hasWetnessEvidence && (humidityAccepted || precipitationAccepted)
          ? wetness.meanTemperatureC
          : undefined,
      solarRadiationMjM2:
        radiationAccepted && radiation.length
          ? this.sum(radiation) * 0.0036
          : undefined,
      et0Mm: et0Accepted && et0Hourly.length ? this.sum(et0Hourly) : undefined,
      rootZoneSoilTemperatureC: this.rootZoneAverage(
        soilTemperature,
        rootDepthCm,
      ),
      rootZoneSoilMoistureM3M3: this.rootZoneAverage(soilMoisture, rootDepthCm),
      soilTemperatureC: soilTemperature,
      soilMoistureM3M3: soilMoisture,
      temperatureHourlyCoveragePct,
      temperatureHighestSourcePriority,
      hourlyAggregateCoverage,
      sourceByVariable,
    };
  }

  /**
   * Nunca delega una profundidad ausente al helper generico: ese helper usa
   * la ultima capa disponible y, con SoilGrids, puede convertir 200 cm de
   * perfil edafico en una falsa profundidad radicular.
   */
  private rootZoneAverage(
    valuesByDepth: Record<string, number> | undefined,
    rootDepthCm?: number,
  ): number | undefined {
    const targetDepth = this.validRootDepth(rootDepthCm);
    return targetDepth === undefined ||
      !this.hasCompleteRootZoneCoverage(valuesByDepth, targetDepth)
      ? undefined
      : promedioPonderadoZonaRadicular(valuesByDepth, targetDepth);
  }

  private hasIncompleteRootZoneCoverage(
    valuesByDepth: Record<string, number> | undefined,
    rootDepthCm?: number,
  ): boolean {
    return !!(
      valuesByDepth &&
      Object.keys(valuesByDepth).length &&
      !this.hasCompleteRootZoneCoverage(valuesByDepth, rootDepthCm)
    );
  }

  private hasCompleteRootZoneCoverage(
    valuesByDepth: Record<string, number> | undefined,
    rootDepthCm?: number,
  ): boolean {
    const targetDepth = this.validRootDepth(rootDepthCm);
    if (!valuesByDepth || targetDepth === undefined) return false;
    const layers = Object.entries(valuesByDepth)
      .map(([range, value]) => {
        const depths =
          range.match(/\d+(?:\.\d+)?/g)?.map((item) => Number(item)) || [];
        return {
          from: depths.length >= 2 ? depths[0] : 0,
          to: depths.length >= 2 ? depths[1] : depths[0],
          value: numeroFinito(value),
        };
      })
      .filter(
        (layer): layer is { from: number; to: number; value: number } =>
          layer.value !== undefined &&
          Number.isFinite(layer.from) &&
          Number.isFinite(layer.to) &&
          layer.to > layer.from,
      )
      .sort((left, right) => left.from - right.from || left.to - right.to);
    let coveredTo = 0;
    for (const layer of layers) {
      if (layer.to <= coveredTo) continue;
      if (layer.from > coveredTo + ROOT_ZONE_COVERAGE_TOLERANCE_CM) {
        return false;
      }
      coveredTo = Math.max(coveredTo, layer.to);
      if (coveredTo + ROOT_ZONE_COVERAGE_TOLERANCE_CM >= targetDepth) {
        return true;
      }
    }
    return false;
  }

  private mergeDailyWeather(
    persisted: IObservacionMeteorologicaNormalizada | undefined,
    derived: IDailyDerived,
  ): IDailyWeatherMerge {
    const values = { ...(persisted?.valores || {}) };
    const sourceByVariable = { ...(persisted?.fuentePorVariable || {}) };
    const persistedHasHumidity = [
      'relativeHumidityMinPct',
      'relativeHumidityMeanPct',
      'relativeHumidityMaxPct',
    ].every((key) => this.hasUsableWeatherValue((values as any)[key]));
    const persistedHasPrecipitation = this.hasUsableWeatherValue(
      values.precipitationMm,
    );
    const persistedHasRadiation = this.hasUsableWeatherValue(
      values.shortwaveRadiationMjM2,
    );
    const persistedHasEt0 = this.hasUsableWeatherValue(values.et0Mm);
    if (persisted?.fuente) {
      for (const key of Object.keys(values) as Array<
        keyof IValoresMeteorologicosNormalizados
      >) {
        if (this.hasUsableWeatherValue(values[key]) && !sourceByVariable[key]) {
          sourceByVariable[key] = persisted.fuente;
        }
      }
    }
    const setIfMissing = (
      key: keyof IValoresMeteorologicosNormalizados,
      value: unknown,
    ) => {
      if ((values as any)[key] === undefined && value !== undefined) {
        (values as any)[key] = value;
        const source = derived.sourceByVariable[key];
        if (source) sourceByVariable[key] = source;
      }
    };
    let rejectedHigherPriorityTemperatureCoverage:
      | IDailyWeatherMerge['rejectedHigherPriorityTemperatureCoverage']
      | undefined;
    let partialHourlyTemperatureCoverage: number | undefined;
    const temperatureKeys = [
      'temperatureMinC',
      'temperatureMeanC',
      'temperatureMaxC',
    ] as const;
    const derivedTemperature = {
      temperatureMinC: derived.temperatureMinC,
      temperatureMeanC: derived.temperatureMeanC,
      temperatureMaxC: derived.temperatureMaxC,
    };
    const derivedTemperatureComplete = temperatureKeys.every((key) =>
      this.hasUsableWeatherValue(derivedTemperature[key]),
    );
    if (derivedTemperatureComplete) {
      const coverage = derived.temperatureHourlyCoveragePct ?? 0;
      const derivedPriority = derived.temperatureHighestSourcePriority ?? 0;
      const persistedKeys = temperatureKeys.filter((key) =>
        this.hasUsableWeatherValue(values[key]),
      );
      const persistedComplete = persistedKeys.length === temperatureKeys.length;
      const persistedPriorities = persistedKeys.map((key) =>
        this.weatherSourcePriority(sourceByVariable[key] || persisted?.fuente),
      );
      const maximumPersistedPriority = persistedPriorities.length
        ? Math.max(...persistedPriorities)
        : 0;
      const improvesPriority = persistedComplete
        ? derivedPriority >= maximumPersistedPriority &&
          persistedKeys.some(
            (key) =>
              derivedPriority >
              this.weatherSourcePriority(
                sourceByVariable[key] || persisted?.fuente,
              ),
          )
        : derivedPriority >= maximumPersistedPriority;
      const requiredCoverage = persistedComplete
        ? MIN_DAILY_TEMPERATURE_REPLACEMENT_COVERAGE_PCT
        : MIN_DAILY_TEMPERATURE_HOURLY_COVERAGE_PCT;
      if (improvesPriority && coverage < requiredCoverage) {
        rejectedHigherPriorityTemperatureCoverage = {
          coveragePct: coverage,
          requiredPct: requiredCoverage,
        };
      } else if (improvesPriority) {
        for (const key of temperatureKeys) {
          values[key] = derivedTemperature[key];
          const source = derived.sourceByVariable[key];
          if (source) sourceByVariable[key] = source;
        }
        if (
          !persistedComplete &&
          coverage < MIN_DAILY_TEMPERATURE_REPLACEMENT_COVERAGE_PCT
        ) {
          partialHourlyTemperatureCoverage = coverage;
        }
      }
    }
    setIfMissing('relativeHumidityMinPct', derived.humidityMinPct);
    setIfMissing('relativeHumidityMeanPct', derived.humidityMeanPct);
    setIfMissing('relativeHumidityMaxPct', derived.humidityMaxPct);
    setIfMissing('dewPointC', derived.dewPointC);
    setIfMissing('precipitationMm', derived.precipitationMm);
    setIfMissing('vpdMeanKpa', derived.vpdMeanKpa);
    setIfMissing('vpdMaxKpa', derived.vpdMaxKpa);
    setIfMissing('shortwaveRadiationMjM2', derived.solarRadiationMjM2);
    setIfMissing('et0Mm', derived.et0Mm);
    setIfMissing('soilTemperatureC', derived.soilTemperatureC);
    setIfMissing('soilMoistureM3M3', derived.soilMoistureM3M3);
    const hourlyAggregateCoverage = derived.hourlyAggregateCoverage.filter(
      (item) => {
        if (item.metric === 'humidity') return !persistedHasHumidity;
        if (item.metric === 'precipitation') return !persistedHasPrecipitation;
        if (item.metric === 'radiation') return !persistedHasRadiation;
        return !persistedHasEt0;
      },
    );
    return {
      values,
      sourceByVariable,
      rejectedHigherPriorityTemperatureCoverage,
      partialHourlyTemperatureCoverage,
      hourlyAggregateCoverage,
    };
  }

  private hourlyAggregateCoverageWarning(
    item: IHourlyAggregateCoverage,
  ): string {
    const coverage = Number(item.coveragePct.toFixed(1));
    if (item.metric === 'humidity') {
      return item.accepted
        ? `La humedad diaria se reconstruyo con ${coverage}% de cobertura horaria; se etiqueta como parcial y debe interpretarse con cautela.`
        : `No se publicaron minima, media ni maxima diaria de humedad: la cobertura horaria fue ${coverage}% y se requiere al menos ${item.requiredPct}%.`;
    }
    if (item.metric === 'precipitation') {
      return `No se publico un total diario de lluvia desde horas parciales: cobertura ${coverage}% (se requiere ${item.requiredPct}% para no confundir horas faltantes con lluvia cero).`;
    }
    if (item.metric === 'radiation') {
      return `No se publico un total diario de radiacion desde horas parciales: cobertura ${coverage}% (se requiere ${item.requiredPct}%).`;
    }
    return `La suma horaria de ET0 cubre ${coverage}% del dia y no se usa como total diario (se requiere ${item.requiredPct}%); se recalcula con FAO-56 solo si existen entradas suficientes.`;
  }

  private hourlyAggregateCoverageFlag(item: IHourlyAggregateCoverage): string {
    if (item.metric === 'humidity' && item.accepted) {
      return 'partial_hourly_daily_humidity';
    }
    const suffix = item.metric === 'humidity' ? 'aggregate' : 'total';
    return `insufficient_hourly_${item.metric}_coverage_for_daily_${suffix}`;
  }

  private resolveSoilProfile(
    lote: ILote,
    parameters: IParametrosAgrometeorologicos,
    soilInputs?: IEntradasAgronomicasSuelo,
    lotWithOriginalRootEvidence: ILote = lote,
  ): ISoilProfile {
    const rootDepth = this.resolveTargetRootDepth(
      lote,
      parameters,
      soilInputs,
      lotWithOriginalRootEvidence,
    );
    const pointSensorLayout = (lote.suelos || []).some((layer) => {
      const sensorNumber = numeroFinito(layer.numeroDeSensor);
      return sensorNumber !== undefined && sensorNumber > 0;
    });
    const pointSensorProfile =
      pointSensorLayout && soilInputs?.selectionReason === 'confirmed_sensor';
    const canonicalHydraulicProfile = this.usableSoilInputs(soilInputs)
      ? !!soilInputs?.depthLayers?.length && !pointSensorProfile
      : false;
    const canonicalProfileConfirmed = [
      'confirmed_laboratory',
      'confirmed_sensor',
    ].includes(soilInputs?.selectionReason || '');
    const canonicalLayers = canonicalHydraulicProfile
      ? (soilInputs?.depthLayers || []).map((layer) => ({
          from: numeroFinito(layer.depthFromCm),
          to: numeroFinito(layer.depthToCm),
          fc: normalizarContenidoVolumetrico(layer.fieldCapacityPercentage),
          wp: normalizarContenidoVolumetrico(layer.wiltingPointPercentage),
        }))
      : [];
    const legacyEndpoints = pointSensorLayout
      ? []
      : [...(lote.suelos || [])]
          .map((layer) => ({
            depth: numeroFinito(layer.profundidad),
            fc: normalizarContenidoVolumetrico(layer.capacidadDeCampo),
            wp: normalizarContenidoVolumetrico(layer.puntoMarchitez),
          }))
          .filter(
            (
              layer,
            ): layer is {
              depth: number;
              fc: number | undefined;
              wp: number | undefined;
            } => layer.depth !== undefined && layer.depth > 0,
          )
          .sort((left, right) => left.depth - right.depth);
    let previousLegacyDepth = 0;
    const legacyLayers = legacyEndpoints.map((layer) => {
      const mapped = {
        from: previousLegacyDepth,
        to: layer.depth,
        fc: layer.fc,
        wp: layer.wp,
      };
      previousLegacyDepth = layer.depth;
      return mapped;
    });
    const layers = (canonicalHydraulicProfile ? canonicalLayers : legacyLayers)
      .filter(
        (
          layer,
        ): layer is {
          from: number;
          to: number;
          fc: number | undefined;
          wp: number | undefined;
        } =>
          layer.from !== undefined &&
          layer.to !== undefined &&
          layer.from >= 0 &&
          layer.to > layer.from,
      )
      .sort((left, right) => left.from - right.from || left.to - right.to);
    let previousHydraulicDepth = 0;
    let hydraulicDepthLimit: number | undefined;
    for (const layer of layers) {
      if (layer.to <= previousHydraulicDepth) continue;
      if (
        layer.from >
        previousHydraulicDepth + ROOT_ZONE_COVERAGE_TOLERANCE_CM
      ) {
        break;
      }
      if (
        layer.fc === undefined ||
        layer.wp === undefined ||
        layer.fc <= layer.wp
      ) {
        break;
      }
      previousHydraulicDepth = Math.max(previousHydraulicDepth, layer.to);
      hydraulicDepthLimit = previousHydraulicDepth;
    }
    const targetDepthCm =
      hydraulicDepthLimit !== undefined
        ? Math.min(rootDepth.depthCm, hydraulicDepthLimit)
        : rootDepth.depthCm;
    const depthMetadata: Pick<
      ISoilProfile,
      | 'depthSource'
      | 'depthConfidence'
      | 'depthIsFallback'
      | 'effectiveDepthLimitCm'
      | 'effectiveDepthSource'
      | 'effectiveDepthConfidence'
      | 'effectiveDepthIsFallback'
      | 'limitedByEffectiveDepth'
      | 'hydraulicDepthLimitCm'
      | 'limitedByHydraulicCoverage'
      | 'requestedRootDepthCm'
      | 'incompleteHydraulicCoverage'
      | 'hydraulicIsScreening'
      | 'pointSensorHydraulicsIgnored'
      | 'potentialProfileCapacityIgnored'
      | 'legacyUniformHydraulicsIgnored'
    > = {
      depthSource: rootDepth.source,
      depthConfidence: rootDepth.confidence,
      depthIsFallback: rootDepth.isFallback,
      effectiveDepthLimitCm: rootDepth.effectiveDepthLimitCm,
      effectiveDepthSource: rootDepth.effectiveDepthSource,
      effectiveDepthConfidence: rootDepth.effectiveDepthConfidence,
      effectiveDepthIsFallback: rootDepth.effectiveDepthIsFallback,
      limitedByEffectiveDepth: rootDepth.limitedByEffectiveDepth,
      hydraulicDepthLimitCm: hydraulicDepthLimit,
      limitedByHydraulicCoverage:
        hydraulicDepthLimit !== undefined &&
        hydraulicDepthLimit < rootDepth.depthCm,
      requestedRootDepthCm: rootDepth.depthCm,
      incompleteHydraulicCoverage:
        layers.length > 0 &&
        (hydraulicDepthLimit === undefined ||
          hydraulicDepthLimit + 1 < rootDepth.depthCm),
      hydraulicIsScreening:
        !canonicalHydraulicProfile || !canonicalProfileConfirmed,
      pointSensorHydraulicsIgnored:
        pointSensorLayout && !canonicalHydraulicProfile,
      potentialProfileCapacityIgnored:
        !canonicalHydraulicProfile &&
        (numeroFinito(soilInputs?.profileAvailableWaterMm) !== undefined ||
          numeroFinito(soilInputs?.rootZoneAvailableWaterMm) !== undefined ||
          numeroFinito(soilInputs?.availableWaterMmPerMeter) !== undefined),
      legacyUniformHydraulicsIgnored: false,
    };
    if (layers.length) {
      let capacity = 0;
      let weightedFc = 0;
      let weightedWp = 0;
      let hydraulicCoverage = 0;
      let integrationCursor = 0;
      for (const layer of layers) {
        if (layer.to <= integrationCursor) continue;
        if (layer.from > integrationCursor + ROOT_ZONE_COVERAGE_TOLERANCE_CM) {
          break;
        }
        const layerTop = Math.max(layer.from, integrationCursor);
        const thickness = Math.max(
          0,
          Math.min(layer.to, targetDepthCm) - layerTop,
        );
        if (layerTop >= targetDepthCm) break;
        if (
          thickness <= 0 ||
          layer.fc === undefined ||
          layer.wp === undefined ||
          layer.fc <= layer.wp
        ) {
          continue;
        }
        capacity += (layer.fc - layer.wp) * thickness * 10;
        weightedFc += layer.fc * thickness;
        weightedWp += layer.wp * thickness;
        hydraulicCoverage += thickness;
        integrationCursor = Math.max(integrationCursor, layer.to);
      }
      if (capacity > 0 && hydraulicCoverage > 0) {
        if (depthMetadata.incompleteHydraulicCoverage) {
          return {
            rootDepthCm: targetDepthCm,
            hydraulicCoverageCm: hydraulicCoverage,
            estimated: true,
            source:
              canonicalHydraulicProfile && !canonicalProfileConfirmed
                ? 'soil_intelligence'
                : 'confirmed_lot',
            ...depthMetadata,
          };
        }
        return {
          capacityMm: capacity,
          fieldCapacity: weightedFc / hydraulicCoverage,
          wiltingPoint: weightedWp / hydraulicCoverage,
          rootDepthCm: targetDepthCm,
          hydraulicCoverageCm: hydraulicCoverage,
          estimated:
            rootDepth.estimated ||
            (canonicalHydraulicProfile && !canonicalProfileConfirmed),
          source:
            canonicalHydraulicProfile && !canonicalProfileConfirmed
              ? 'soil_intelligence'
              : 'confirmed_lot',
          ...depthMetadata,
        };
      }
      return {
        rootDepthCm: targetDepthCm,
        hydraulicCoverageCm: hydraulicCoverage,
        estimated: true,
        source:
          canonicalHydraulicProfile && !canonicalProfileConfirmed
            ? 'soil_intelligence'
            : 'confirmed_lot',
        ...depthMetadata,
      };
    }
    const originalFieldCapacity = numeroFinito(
      lotWithOriginalRootEvidence.capacidadDeCampo,
    );
    const originalWiltingPoint = numeroFinito(
      lotWithOriginalRootEvidence.puntoMarchitez,
    );
    const confirmedUniformDepth =
      lotWithOriginalRootEvidence.sueloConfirmadoPorUsuario === true &&
      !pointSensorLayout
        ? this.validRootDepth(
            lotWithOriginalRootEvidence.sueloReferencia?.profundidadCm,
          )
        : undefined;
    const confirmedUniformProfile =
      confirmedUniformDepth !== undefined &&
      confirmedUniformDepth + ROOT_ZONE_COVERAGE_TOLERANCE_CM >= targetDepthCm;
    depthMetadata.legacyUniformHydraulicsIgnored =
      !confirmedUniformProfile &&
      originalFieldCapacity !== undefined &&
      originalWiltingPoint !== undefined;
    const legacyCapacity = confirmedUniformProfile
      ? calcularCapacidadAguaUtilMm(
          originalFieldCapacity,
          originalWiltingPoint,
          targetDepthCm,
        )
      : undefined;
    if (legacyCapacity !== undefined) {
      return {
        capacityMm: legacyCapacity,
        fieldCapacity: normalizarContenidoVolumetrico(originalFieldCapacity),
        wiltingPoint: normalizarContenidoVolumetrico(originalWiltingPoint),
        rootDepthCm: targetDepthCm,
        estimated: rootDepth.estimated,
        source: 'confirmed_lot',
        ...depthMetadata,
      };
    }
    return {
      rootDepthCm: targetDepthCm,
      estimated: true,
      source: 'crop_reference',
      ...depthMetadata,
    };
  }

  private resolveTargetRootDepth(
    lote: ILote,
    parameters: IParametrosAgrometeorologicos,
    soilInputs?: IEntradasAgronomicasSuelo,
    lotWithOriginalRootEvidence: ILote = lote,
  ): IRootDepthResolution {
    const explicitRootDepths = (lotWithOriginalRootEvidence.suelos || [])
      .filter((layer) => layer.hayRaices === true)
      .map((layer) => this.validRootDepth(layer.profundidad))
      .filter((depth): depth is number => depth !== undefined);
    const parameterDepth = this.validRootDepth(
      parameters.profundidadRadicularCm,
    );
    const validatedParameter = parameters.estado === 'validado';
    const baseRoot: Omit<
      IRootDepthResolution,
      | 'effectiveDepthLimitCm'
      | 'effectiveDepthSource'
      | 'effectiveDepthConfidence'
      | 'effectiveDepthIsFallback'
      | 'limitedByEffectiveDepth'
    > = explicitRootDepths.length
      ? {
          depthCm: Math.max(...explicitRootDepths),
          source: 'confirmed_root_profile',
          confidence: 'medium',
          estimated: false,
          isFallback: false,
        }
      : parameterDepth !== undefined
        ? {
            depthCm: parameterDepth,
            source: 'crop_parameter',
            confidence: validatedParameter ? 'high' : 'low',
            estimated: !validatedParameter,
            isFallback: false,
          }
        : {
            depthCm: OPERATIONAL_ROOT_DEPTH_FALLBACK_CM,
            source: 'operational_fallback',
            confidence: 'low',
            estimated: true,
            isFallback: true,
          };

    const effectiveDepth = this.resolveEffectiveSoilDepth(lote, soilInputs);
    const calculationDepth = effectiveDepth
      ? Math.min(baseRoot.depthCm, effectiveDepth.depthCm)
      : baseRoot.depthCm;
    return {
      ...baseRoot,
      depthCm: calculationDepth,
      estimated: baseRoot.estimated || !!effectiveDepth?.estimated,
      effectiveDepthLimitCm: effectiveDepth?.depthCm,
      effectiveDepthSource: effectiveDepth?.source,
      effectiveDepthConfidence: effectiveDepth?.confidence,
      effectiveDepthIsFallback: effectiveDepth?.isFallback,
      limitedByEffectiveDepth:
        !!effectiveDepth && effectiveDepth.depthCm < baseRoot.depthCm,
    };
  }

  private resolveEffectiveSoilDepth(
    lote: ILote,
    soilInputs?: IEntradasAgronomicasSuelo,
  ):
    | {
        depthCm: number;
        source: string;
        confidence: 'high' | 'medium' | 'low' | 'unavailable';
        estimated: boolean;
        isFallback: boolean;
      }
    | undefined {
    const confirmedSoilDepth = lote.sueloConfirmadoPorUsuario
      ? this.validRootDepth(lote.sueloReferencia?.profundidadCm)
      : undefined;
    if (confirmedSoilDepth !== undefined) {
      return {
        depthCm: confirmedSoilDepth,
        source: lote.sueloReferencia?.fuente || 'confirmed_lot',
        confidence:
          lote.sueloReferencia?.confianza === 'alta'
            ? 'high'
            : lote.sueloReferencia?.confianza === 'baja'
              ? 'low'
              : 'medium',
        estimated: false,
        isFallback: false,
      };
    }

    if (!this.usableSoilInputs(soilInputs)) return undefined;
    const metadata = soilInputs!;
    const provenance = soilInputs?.provenance?.effectiveDepthCm;
    const intelligenceDepth = this.validRootDepth(
      soilInputs?.effectiveDepthCm ?? provenance?.value,
    );
    const confidence =
      metadata.effectiveDepthConfidence ??
      provenance?.confidence ??
      soilInputs?.confidence ??
      'low';
    if (intelligenceDepth === undefined || confidence === 'unavailable') {
      return undefined;
    }
    const method = String(provenance?.method || '').toLowerCase();
    const isFallback =
      metadata.effectiveDepthIsFallback === true ||
      method.includes('respaldo') ||
      method.includes('fallback');
    const confirmed = ['confirmed_laboratory', 'confirmed_sensor'].includes(
      soilInputs!.selectionReason,
    );
    return {
      depthCm: intelligenceDepth,
      source:
        metadata.effectiveDepthSource ||
        provenance?.source ||
        soilInputs?.source ||
        'soil_intelligence',
      confidence,
      estimated: !confirmed,
      isFallback,
    };
  }

  private usableSoilInputs(soilInputs?: IEntradasAgronomicasSuelo): boolean {
    return !!(
      soilInputs &&
      !soilInputs.stale &&
      ['ready', 'partial', 'no_coverage'].includes(soilInputs.status)
    );
  }

  private validRootDepth(value: unknown): number | undefined {
    const parsed = numeroFinito(value);
    return parsed !== undefined &&
      parsed > 0 &&
      parsed <= MAX_VALID_ROOT_DEPTH_CM
      ? parsed
      : undefined;
  }

  private storageFromSoilMoisture(
    moisture: number | undefined,
    profile: ISoilProfile,
  ): number | undefined {
    if (
      moisture === undefined ||
      profile.capacityMm === undefined ||
      profile.fieldCapacity === undefined ||
      profile.wiltingPoint === undefined ||
      profile.fieldCapacity <= profile.wiltingPoint
    ) {
      return undefined;
    }
    const fraction = clamp(
      (moisture - profile.wiltingPoint) /
        (profile.fieldCapacity - profile.wiltingPoint),
      0,
      1,
    );
    return profile.capacityMm * fraction;
  }

  private initialStorageFromSowing(
    siembra: ISiembra,
    capacity?: number,
  ): number | undefined {
    if (!capacity) return undefined;
    if (!this.hasValidAvailableWaterState(siembra)) return capacity;
    const value = numeroFinito(siembra.aguaUtilReal);
    if (value === undefined) return capacity;
    if (value <= 1) return clamp(value * capacity, 0, capacity);
    if (value <= 100) return clamp((value / 100) * capacity, 0, capacity);
    return clamp(value, 0, capacity);
  }

  private hasValidAvailableWaterState(siembra: ISiembra): boolean {
    return (
      siembra.estadoCalculoAguaUtil === 'calculado' ||
      siembra.estadoCalculoAguaUtil === 'estimado'
    );
  }

  private resolveIrrigationEvents(siembra: ISiembra): Map<string, number> {
    const events = [
      ...(((siembra as any).riegos || []) as Array<Record<string, unknown>>),
      ...(((siembra as any).eventosRiego || []) as Array<
        Record<string, unknown>
      >),
    ];
    const result = new Map<string, number>();
    for (const event of events) {
      const rawDate = event.fecha || event.fechaRiego || event.createdAt;
      if (!rawDate) continue;
      const date = new Date(String(rawDate));
      if (Number.isNaN(date.getTime())) continue;
      const amount = numeroFinito(
        event.laminaMm ?? event.cantidadMm ?? event.mm ?? event.riegoMm,
      );
      if (amount === undefined || amount < 0) continue;
      const key =
        typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawDate)
          ? rawDate.slice(0, 10)
          : this.localDateInTimezone(date, DEFAULT_OPERATIONAL_TIMEZONE);
      result.set(key, (result.get(key) || 0) + amount);
    }
    return result;
  }

  private resolveStage(
    siembra: ISiembra,
    date: string,
    accumulatedGdd: number,
    parameters?: IParametrosAgrometeorologicos,
    thermalContext?: IThermalStageContext,
  ): string {
    const stages = (siembra.crono?.etapas || {}) as Record<string, number>;
    const entries = Object.entries(stages).filter(([, value]) =>
      Number.isFinite(Number(value)),
    );
    const observed = this.resolveObservedStage(siembra, date, entries);
    if (observed) return observed;
    if (
      this.normalize(siembra.semilla?.cultivo) === 'arveja' &&
      Number.isFinite(accumulatedGdd)
    ) {
      const peaStage = resolverFenologiaTermicaArveja({
        referencia: siembra.semilla?.fenologiaReferencia,
        gradosDiaAcumulados: accumulatedGdd,
      });
      if (peaStage.fuente === 'termica') return peaStage.nombre;
    }
    if (
      !esCultivoPerenne(siembra.semilla?.cultivo) &&
      this.hasValidatedVarietalThermalProfile(siembra)
    ) {
      const thermalStage = this.resolveValidatedGddStage(
        parameters ||
          siembra.semilla?.parametrosAgrometeorologicos ||
          ({ version: 'sin-parametros' } as IParametrosAgrometeorologicos),
        accumulatedGdd,
        thermalContext,
      );
      if (thermalStage) return thermalStage;
    }
    let predicted = 'Ciclo en seguimiento';
    if (entries.length && esCultivoPerenne(siembra.semilla?.cultivo)) {
      const sorted = entries
        .map(([name, value]) => ({ name, day: Number(value) }))
        .sort((a, b) => a.day - b.day);
      const campaignStart = this.perennialCampaignStart(date);
      const campaignDay = this.daysBetween(campaignStart, date);
      predicted = this.humanizeStage(
        [...sorted].reverse().find((item) => campaignDay >= item.day)?.name ||
          sorted[0].name,
      );
    } else if (entries.length) {
      const days = this.daysBetween(siembra.fechaSiembra, date);
      const labels =
        ANNUAL_CHRONO_STAGE_LABELS[this.normalize(siembra.semilla?.cultivo)];
      if (labels?.length === entries.length + 1) {
        let stageIndex = 0;
        let accumulated = 0;
        for (const [, duration] of entries) {
          accumulated += Math.max(0, Number(duration));
          if (days >= accumulated) stageIndex += 1;
          else break;
        }
        predicted = labels[Math.min(stageIndex, labels.length - 1)];
      } else {
        let accumulated = 0;
        let stage = entries[0][0];
        for (const [name, duration] of entries) {
          accumulated += Math.max(0, Number(duration));
          if (days >= accumulated) stage = name;
          else break;
        }
        predicted = this.humanizeStage(stage);
      }
    } else {
      const thermalRanges =
        siembra.semilla?.fenologiaReferencia?.rangosTermicos;
      const match = Object.entries(thermalRanges || {}).find(
        ([, range]) =>
          accumulatedGdd >= range.min && accumulatedGdd <= range.max,
      );
      if (match) predicted = this.humanizeStage(match[0]);
    }
    return predicted;
  }

  private resolveValidatedGddStage(
    parameters: IParametrosAgrometeorologicos,
    accumulatedGdd: number,
    context?: IThermalStageContext,
    applyConstraints = true,
  ): string | undefined {
    if (
      parameters.estado !== 'validado' ||
      parameters.metodoGdd !== 'promedio_limitado' ||
      parameters.semanticaGddPorEtapa !==
        'rangos_acumulados_desde_inicio_termico' ||
      !String(parameters.fuente || '').trim() ||
      !Number.isFinite(accumulatedGdd)
    ) {
      return undefined;
    }
    const stages = Object.entries(parameters.gddPorEtapa || {})
      .map(([name, range]) => ({
        name,
        order: numeroFinito(range.orden),
        start: numeroFinito(range.min) ?? numeroFinito(range.objetivo),
      }))
      .filter(
        (
          item,
        ): item is {
          name: string;
          order: number;
          start: number;
        } =>
          item.order !== undefined &&
          item.start !== undefined &&
          item.start >= 0,
      )
      .sort((a, b) => a.order - b.order);
    const monotonic = stages.every(
      (item, index) => index === 0 || item.start > stages[index - 1].start,
    );
    if (
      !stages.length ||
      new Set(stages.map((item) => item.order)).size !== stages.length ||
      !monotonic
    ) {
      return undefined;
    }
    let stageIndex = -1;
    for (let index = stages.length - 1; index >= 0; index -= 1) {
      if (accumulatedGdd >= stages[index].start) {
        stageIndex = index;
        break;
      }
    }
    if (stageIndex < 0) stageIndex = 0;
    if (applyConstraints) {
      const vernalizationLimit = this.resolveVernalizationStageLimit(
        parameters,
        stages,
        stageIndex,
        context,
      );
      if (vernalizationLimit === undefined) return undefined;
      stageIndex = vernalizationLimit;

      stageIndex = this.resolvePhotoperiodStageLimit(
        parameters,
        stages,
        stageIndex,
        context?.photoperiodHours,
      ).stageIndex;
    }
    return this.humanizeStage(stages[stageIndex]?.name || stages[0].name);
  }

  private resolveStageProvenance(
    siembra: ISiembra,
    date: string,
    accumulatedGdd: number,
    parameters: IParametrosAgrometeorologicos,
    context?: IThermalStageContext,
  ): IStageProvenance {
    const entries = Object.entries(
      (siembra.crono?.etapas || {}) as Record<string, number>,
    ).filter(([, value]) => Number.isFinite(Number(value))) as Array<
      [string, number]
    >;
    const fieldStage = this.resolveFieldStageResolution(siembra, date, entries);
    if (fieldStage) {
      return {
        source: fieldStage.exactFieldRecord
          ? 'campo'
          : 'proyeccion_anclada_campo',
        confidence: fieldStage.confidence,
        modelVersion: fieldStage.modelVersion,
      };
    }
    if (
      this.normalize(siembra.semilla?.cultivo) === 'arveja' &&
      Number.isFinite(accumulatedGdd)
    ) {
      const peaStage = resolverFenologiaTermicaArveja({
        referencia: siembra.semilla?.fenologiaReferencia,
        gradosDiaAcumulados: accumulatedGdd,
      });
      if (peaStage.fuente === 'termica') {
        return {
          source: 'rango_termico_referencia',
          confidence: 'referencia',
        };
      }
    }
    if (
      !esCultivoPerenne(siembra.semilla?.cultivo) &&
      this.hasValidatedVarietalThermalProfile(siembra) &&
      this.resolveValidatedGddStage(parameters, accumulatedGdd, context)
    ) {
      return {
        source: 'gdd_validado',
        confidence: 'media',
        modelVersion: parameters.version,
      };
    }
    if (entries.length) {
      return {
        source: 'cronograma_referencia',
        confidence: 'referencia',
      };
    }
    const thermalRanges = siembra.semilla?.fenologiaReferencia?.rangosTermicos;
    const hasReferenceRange =
      Number.isFinite(accumulatedGdd) &&
      Object.values(thermalRanges || {}).some(
        (range) => accumulatedGdd >= range.min && accumulatedGdd <= range.max,
      );
    return hasReferenceRange
      ? {
          source: 'rango_termico_referencia',
          confidence: 'referencia',
        }
      : {
          source: 'seguimiento',
          confidence: 'referencia',
        };
  }

  private stageCanDriveDecisionModels(
    siembra: ISiembra,
    provenance: IStageProvenance,
  ): boolean {
    if (provenance.confidence === 'referencia') return false;
    if (!esCultivoPerenne(siembra.semilla?.cultivo)) {
      return (
        provenance.source === 'campo' ||
        provenance.source === 'proyeccion_anclada_campo' ||
        provenance.source === 'gdd_validado'
      );
    }
    return (
      provenance.source === 'campo' ||
      provenance.source === 'proyeccion_anclada_campo'
    );
  }

  private resolveVernalizationStageLimit(
    parameters: IParametrosAgrometeorologicos,
    stages: Array<{ name: string; order: number; start: number }>,
    candidateIndex: number,
    context?: IThermalStageContext,
  ): number | undefined {
    if (!this.requiresVernalizationGate(parameters)) return candidateIndex;
    if (!this.hasCalibratedVernalization(parameters)) return undefined;

    const finalStage = parameters.ventanaVernalizacion?.finEtapa;
    const finalStageIndex = stages.findIndex(
      (stage) => this.normalize(stage.name) === this.normalize(finalStage),
    );
    if (finalStageIndex < 1) return undefined;
    if (candidateIndex < finalStageIndex) return candidateIndex;

    const requirement = numeroFinito(parameters.requerimientoVernalizacion);
    const accumulated = numeroFinito(context?.vernalizationAccumulated);
    const requirementMet =
      requirement !== undefined &&
      accumulated !== undefined &&
      accumulated >= requirement;
    const dataReady =
      context?.vernalizationCoverageSufficient === true &&
      context?.vernalizationContinuitySufficient === true;
    return requirementMet && dataReady ? candidateIndex : finalStageIndex - 1;
  }

  private resolveThermalStageGate(
    parameters: IParametrosAgrometeorologicos,
    accumulatedGdd: number,
    context?: IThermalStageContext,
  ): TThermalStageGate | undefined {
    const rawStage = this.resolveValidatedGddStage(
      parameters,
      accumulatedGdd,
      context,
      false,
    );
    if (!rawStage) return undefined;

    if (this.requiresVernalizationGate(parameters)) {
      if (!this.hasCalibratedVernalization(parameters)) {
        return 'vernalizacion_sin_calibrar';
      }
      const stages = Object.entries(parameters.gddPorEtapa || {})
        .map(([name, range]) => ({
          name,
          order: numeroFinito(range.orden),
        }))
        .filter(
          (
            item,
          ): item is {
            name: string;
            order: number;
          } => item.order !== undefined,
        )
        .sort((left, right) => left.order - right.order);
      const rawIndex = stages.findIndex(
        (stage) => this.normalize(stage.name) === this.normalize(rawStage),
      );
      const finalIndex = stages.findIndex(
        (stage) =>
          this.normalize(stage.name) ===
          this.normalize(parameters.ventanaVernalizacion?.finEtapa),
      );
      if (finalIndex < 1) return 'vernalizacion_sin_calibrar';
      if (rawIndex >= finalIndex) {
        const requirement = numeroFinito(parameters.requerimientoVernalizacion);
        const accumulated = numeroFinito(context?.vernalizationAccumulated);
        if (
          requirement === undefined ||
          accumulated === undefined ||
          accumulated < requirement ||
          context?.vernalizationCoverageSufficient !== true ||
          context?.vernalizationContinuitySufficient !== true
        ) {
          return 'vernalizacion_pendiente';
        }
      }
    }

    const stages = Object.entries(parameters.gddPorEtapa || {})
      .map(([name, range]) => ({
        name,
        order: numeroFinito(range.orden),
        start: numeroFinito(range.min) ?? numeroFinito(range.objetivo),
      }))
      .filter(
        (
          item,
        ): item is {
          name: string;
          order: number;
          start: number;
        } =>
          item.order !== undefined &&
          item.start !== undefined &&
          item.start >= 0,
      )
      .sort((left, right) => left.order - right.order);
    const rawIndex = stages.findIndex(
      (stage) => this.normalize(stage.name) === this.normalize(rawStage),
    );
    if (rawIndex < 0) return undefined;
    const vernalizationLimit = this.resolveVernalizationStageLimit(
      parameters,
      stages,
      rawIndex,
      context,
    );
    if (vernalizationLimit === undefined) return undefined;
    const photoperiodLimit = this.resolvePhotoperiodStageLimit(
      parameters,
      stages,
      vernalizationLimit,
      context?.photoperiodHours,
    );
    if (photoperiodLimit.blockedStageIndex !== undefined) {
      return 'fotoperiodo_incompatible';
    }
    return undefined;
  }

  private resolvePhotoperiodStageLimit(
    parameters: IParametrosAgrometeorologicos,
    stages: Array<{ name: string; order: number; start: number }>,
    candidateIndex: number,
    photoperiodHours?: number,
  ): IPhotoperiodStageLimit {
    /*
     * El GDD puede atravesar varias etapas en un único cálculo. Cada transición
     * condicionada por fotoperíodo debe validarse en orden: una etapa posterior
     * compatible no habilita saltar una etapa intermedia incompatible.
     */
    for (let index = 0; index <= candidateIndex; index += 1) {
      if (
        this.resolvePhotoperiodCompatibility(
          parameters,
          stages[index].name,
          photoperiodHours,
        ) === false
      ) {
        return {
          stageIndex: Math.max(0, index - 1),
          blockedStageIndex: index,
        };
      }
    }
    return { stageIndex: candidateIndex };
  }

  private requiresVernalizationGate(
    parameters: IParametrosAgrometeorologicos,
  ): boolean {
    if (parameters.procesoTermico !== 'vernalizacion_anual') return false;
    if (parameters.habitoVernalizacion === 'primaveral') return false;
    return numeroFinito(parameters.requerimientoVernalizacion) !== 0;
  }

  private resolveObservedStage(
    siembra: ISiembra,
    date: string,
    entries: Array<[string, number]>,
  ): string | undefined {
    return this.resolveFieldStageResolution(siembra, date, entries)?.stage;
  }

  private hasValidatedVarietalThermalProfile(siembra: ISiembra): boolean {
    return evaluarEvidenciaTermicaVarietal(siembra.semilla)
      .perfilVarietalValidado;
  }

  private resolveFieldStageConfidence(
    record: IRegistroFenologico,
    exactFieldRecord: boolean,
  ): IStageProvenance['confidence'] {
    if (!this.phenologyRecordCanDriveDecision(record)) {
      return 'referencia';
    }
    if (record.confianza === 'media') return 'media';
    return exactFieldRecord ? 'alta' : 'media';
  }

  private phenologyRecordCanDriveDecision(
    record: IRegistroFenologico,
  ): boolean {
    const observedCoverage = numeroFinito(record.coberturaObservadaPct);
    return (
      record.confianza !== 'baja' &&
      !(observedCoverage !== undefined && observedCoverage <= 0)
    );
  }

  private resolveFieldStageResolution(
    siembra: ISiembra,
    date: string,
    entries: Array<[string, number]>,
  ): IFieldStageResolution | undefined {
    const campaign = this.phenologyCampaign(siembra, date);
    const cycleStart = esCultivoPerenne(siembra.semilla?.cultivo)
      ? this.perennialCampaignStart(date)
      : String(siembra.fechaSiembra || '').slice(0, 10);
    const fieldRecords = this.activePhenologyRecords(
      siembra.registrosFenologicos,
    )
      .filter((item) => {
        const recordDate = String(
          item.fechaInicioEtapa || item.fecha || item.fechaObservacion || '',
        ).slice(0, 10);
        if (!recordDate || recordDate > date || !item.etapa) return false;
        if (
          item.campania &&
          this.normalizePhenologyCampaign(item.campania) !==
            this.normalizePhenologyCampaign(campaign)
        ) {
          return false;
        }
        return !cycleStart || recordDate >= cycleStart;
      })
      .sort((a, b) =>
        String(
          a.fechaInicioEtapa || a.fecha || a.fechaObservacion,
        ).localeCompare(
          String(b.fechaInicioEtapa || b.fecha || b.fechaObservacion),
        ),
      );
    /*
     * Una observación describe el estado visto ese día; no reemplaza el último
     * inicio/biofix vigente. Primero se busca una observación exacta y, para
     * días posteriores, se vuelve al último anclaje de etapa.
     */
    const pointObservation = [...fieldRecords]
      .filter((item) => {
        const recordDate = String(
          item.fechaInicioEtapa || item.fecha || item.fechaObservacion || '',
        ).slice(0, 10);
        return (
          recordDate === date &&
          (item.tipoEvento === 'observacion' || item.accion === 'observacion')
        );
      })
      .pop();
    const field =
      pointObservation ||
      [...fieldRecords]
        .filter(
          (item) =>
            item.tipoEvento !== 'observacion' && item.accion !== 'observacion',
        )
        .pop();
    if (!field?.etapa) return undefined;
    const recordDate = String(
      field.fechaInicioEtapa || field.fecha || field.fechaObservacion,
    ).slice(0, 10);
    const isPointObservation =
      field.tipoEvento === 'observacion' || field.accion === 'observacion';
    if (isPointObservation) {
      return recordDate === date
        ? {
            stage: field.etapa,
            exactFieldRecord: true,
            confidence: this.resolveFieldStageConfidence(field, true),
            modelVersion: 'observacion-campo-v1',
          }
        : undefined;
    }
    if (recordDate === date) {
      return {
        stage: field.etapa,
        exactFieldRecord: true,
        confidence: this.resolveFieldStageConfidence(field, true),
        modelVersion:
          field.tipoEvento === 'biofix'
            ? 'biofix-campo-v1'
            : 'inicio-etapa-campo-v1',
      };
    }
    /*
     * En perennes, un inicio de etapa o biofix observado es el estado operativo
     * vigente hasta que exista otro registro de campo. Las duraciones cargadas
     * para una variedad importada sirven como referencia de contraste, pero no
     * deben sobreescribir silenciosamente una observación real.
     */
    if (esCultivoPerenne(siembra.semilla?.cultivo)) {
      return {
        stage: field.etapa,
        exactFieldRecord: false,
        confidence: this.resolveFieldStageConfidence(field, false),
        modelVersion: 'proyeccion-anclada-campo-v1',
      };
    }
    const elapsedDays = this.daysBetween(recordDate, date);
    if (elapsedDays <= 0 || !entries.length) {
      return {
        stage: field.etapa,
        exactFieldRecord: false,
        confidence: this.resolveFieldStageConfidence(field, false),
        modelVersion: 'proyeccion-anclada-campo-v1',
      };
    }

    const labels =
      ANNUAL_CHRONO_STAGE_LABELS[this.normalize(siembra.semilla?.cultivo)];
    if (!labels?.length) {
      return {
        stage: field.etapa,
        exactFieldRecord: false,
        confidence: this.resolveFieldStageConfidence(field, false),
        modelVersion: 'proyeccion-anclada-campo-v1',
      };
    }
    let index = labels.findIndex(
      (label) => this.normalize(label) === this.normalize(field.etapa),
    );
    if (index < 0) {
      return {
        stage: field.etapa,
        exactFieldRecord: false,
        confidence: this.resolveFieldStageConfidence(field, false),
        modelVersion: 'proyeccion-anclada-campo-v1',
      };
    }
    let remaining = elapsedDays;
    while (index < labels.length - 1 && index < entries.length) {
      const duration = Math.max(1, Number(entries[index][1]) || 1);
      if (remaining < duration) break;
      remaining -= duration;
      index += 1;
    }
    return {
      stage: labels[index],
      exactFieldRecord: false,
      confidence: this.resolveFieldStageConfidence(field, false),
      modelVersion: 'cronograma-anclado-campo-v1',
    };
  }

  private phenologyCampaign(siembra: ISiembra, date: string): string {
    const parsed = new Date(`${date}T12:00:00.000Z`);
    if (esCultivoPerenne(siembra.semilla?.cultivo)) {
      const year =
        parsed.getUTCMonth() >= 6
          ? parsed.getUTCFullYear()
          : parsed.getUTCFullYear() - 1;
      return `${year}/${year + 1}`;
    }
    const implantation = new Date(siembra.fechaSiembra || parsed);
    const year = Number.isNaN(implantation.getTime())
      ? parsed.getUTCFullYear()
      : implantation.getUTCFullYear();
    return `${year}/${year + 1}`;
  }

  private resolveThermalStart(
    siembra: ISiembra,
    referenceDate: string,
  ): string | undefined {
    if (!esCultivoPerenne(siembra.semilla?.cultivo)) {
      return String(siembra.fechaSiembra || '').slice(0, 10);
    }
    const campaign = this.phenologyCampaign(siembra, referenceDate);
    const seasonalSearchStart = this.perennialCampaignStart(referenceDate);
    const biofix = this.activePhenologyRecords(siembra.registrosFenologicos)
      .filter((record) => {
        if (record.tipoEvento !== 'biofix') return false;
        if (!this.phenologyRecordCanDriveDecision(record)) return false;
        const objectives = record.objetivosBiofix || [];
        if (
          !objectives.some((objective) =>
            ['inicio_forzado', 'reinicio_gdd_forzado'].includes(
              String(objective),
            ),
          )
        ) {
          return false;
        }
        if (
          record.campania &&
          this.normalizePhenologyCampaign(record.campania) !==
            this.normalizePhenologyCampaign(campaign)
        ) {
          return false;
        }
        const date = String(
          record.fechaInicioEtapa ||
            record.fechaObservacion ||
            record.fecha ||
            '',
        ).slice(0, 10);
        return !!date && date >= seasonalSearchStart && date <= referenceDate;
      })
      .map((record) =>
        String(
          record.fechaInicioEtapa || record.fechaObservacion || record.fecha,
        ).slice(0, 10),
      )
      .sort()
      .pop();
    return biofix;
  }

  private hasCurrentCampaignBiofix(
    siembra: ISiembra,
    thermalStart: string,
  ): boolean {
    return this.activePhenologyRecords(siembra.registrosFenologicos).some(
      (record) =>
        record.tipoEvento === 'biofix' &&
        this.phenologyRecordCanDriveDecision(record) &&
        (record.objetivosBiofix || []).some((objective) =>
          ['inicio_forzado', 'reinicio_gdd_forzado'].includes(
            String(objective),
          ),
        ) &&
        String(
          record.fechaInicioEtapa ||
            record.fechaObservacion ||
            record.fecha ||
            '',
        ).slice(0, 10) === thermalStart,
    );
  }

  private normalizePhenologyCampaign(value?: string): string {
    const years = String(value || '').match(/\d{4}/g);
    if (years?.length >= 2) return `${years[0]}/${years[1]}`;
    return this.normalize(value);
  }

  private resolveThresholds(
    parameters: IParametrosAgrometeorologicos,
    stage: string,
  ): { coldC: number; heatC: number; vpdKpa: number } {
    const normalized = this.normalize(stage);
    const stageThreshold = Object.entries(
      parameters.umbralesPorEtapa || {},
    ).find(([key]) => this.normalize(key) === normalized)?.[1];
    return {
      coldC: stageThreshold?.frioC ?? parameters.umbralFrioC ?? 0,
      heatC: stageThreshold?.calorC ?? parameters.umbralCalorC ?? 35,
      vpdKpa: stageThreshold?.vpdKpa ?? parameters.umbralVpdKpa ?? 2,
    };
  }

  private resolvePhotoperiodCompatibility(
    parameters: IParametrosAgrometeorologicos,
    stage: string,
    photoperiodHours?: number,
  ): boolean | undefined {
    const profile = parameters.fotoperiodoVarietal;
    if (
      profile?.modelo !== 'umbral_por_etapa' ||
      profile.estado !== 'validado' ||
      !String(profile.fuente || '').trim() ||
      !Number.isFinite(photoperiodHours)
    ) {
      return undefined;
    }
    const stageProfile = Object.entries(profile.porEtapa || {}).find(
      ([name]) => this.normalize(name) === this.normalize(stage),
    )?.[1];
    if (!stageProfile) return undefined;
    if (stageProfile.respuesta === 'neutra') return true;
    const threshold = numeroFinito(stageProfile.umbralHoras);
    if (threshold === undefined) return undefined;
    return stageProfile.respuesta === 'dia_largo'
      ? Number(photoperiodHours) >= threshold
      : Number(photoperiodHours) <= threshold;
  }

  private cycleProgress(siembra: ISiembra, date: string): number | undefined {
    if (esCultivoPerenne(siembra.semilla?.cultivo)) {
      const campaignStart = this.perennialCampaignStart(date);
      return clamp((this.daysBetween(campaignStart, date) / 365) * 100, 0, 100);
    }
    const values = Object.values(
      (siembra.crono?.etapas || {}) as Record<string, number>,
    )
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0);
    const total = values.reduce((sum, value) => sum + value, 0);
    if (!total) return undefined;
    return clamp(
      (this.daysBetween(siembra.fechaSiembra, date) / total) * 100,
      0,
      100,
    );
  }

  private solarTimes(
    date: string,
    coordinates: ICoordenadas,
    timezone?: string,
  ): { sunrise?: string; sunset?: string } {
    const times = SunCalc.getTimes(
      new Date(`${date}T12:00:00Z`),
      coordinates.lat,
      coordinates.lng,
    );
    return {
      sunrise: this.formatTime(times.sunrise, timezone),
      sunset: this.formatTime(times.sunset, timezone),
    };
  }

  private formatTime(date: Date, timezone?: string): string | undefined {
    if (Number.isNaN(date.getTime())) return undefined;
    try {
      return new Intl.DateTimeFormat('es-AR', {
        timeZone: timezone || 'America/Argentina/Buenos_Aires',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
    } catch {
      return date.toISOString().slice(11, 16);
    }
  }

  private groupHourlyByDate(
    observations: IObservacionMeteorologicaNormalizada[],
  ): Map<string, IObservacionMeteorologicaNormalizada[]> {
    const groups = new Map<string, IObservacionMeteorologicaNormalizada[]>();
    for (const item of observations) {
      if (item.granularidad !== 'hourly') continue;
      groups.set(item.fechaLocal, [
        ...(groups.get(item.fechaLocal) || []),
        item,
      ]);
    }
    groups.forEach((items) =>
      items.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    );
    return groups;
  }

  private async loadObservations(
    idEstablecimiento: string,
    from: string,
    idLote?: string,
  ): Promise<IObservacionMeteorologicaNormalizada[]> {
    const to = new Date();
    to.setUTCDate(to.getUTCDate() + 15);
    const result = await this.repository.getObservaciones({
      filter: JSON.stringify({
        idEstablecimiento,
        timestamp: {
          $gte: new Date(from).toISOString(),
          $lte: to.toISOString(),
        },
      }),
      sort: JSON.stringify({ timestamp: 1 }),
      limit: 0,
    });
    return (result.datos || [])
      .map((item) => this.resolveLotObservation(item, idLote))
      .filter((item): item is IObservacionMeteorologicaNormalizada => !!item);
  }

  private resolveLotObservation(
    observation: IObservacionMeteorologicaNormalizada,
    idLote?: string,
  ): IObservacionMeteorologicaNormalizada | undefined {
    if (!observation || typeof observation !== 'object') return undefined;
    const base = observation as IObservacionMeteorologicaNormalizada;
    let resolved: IObservacionMeteorologicaNormalizada = base;
    if (idLote) {
      const context = base.contextosLote?.[this.safeWeatherContextKey(idLote)];
      if (context) {
        resolved = {
          ...base,
          ...context,
          valores: {
            ...(base.valores || {}),
            ...(context.valores || {}),
          },
          fuentePorVariable: {
            ...(base.fuentePorVariable || {}),
            ...(context.fuentePorVariable || {}),
          },
          estadoPorVariable: {
            ...(base.estadoPorVariable || {}),
            ...(context.estadoPorVariable || {}),
          },
          banderasCalidad: Array.from(
            new Set([
              ...(Array.isArray(base.banderasCalidad)
                ? base.banderasCalidad
                : []),
              ...(Array.isArray(context.banderasCalidad)
                ? context.banderasCalidad
                : []),
            ]),
          ),
          contextosLote: base.contextosLote,
        };
      } else if (base.idLote !== idLote) {
        return undefined;
      }
    }

    const timestamp = String(resolved.timestamp || '');
    const fechaLocal = String(resolved.fechaLocal || '');
    if (
      !timestamp ||
      Number.isNaN(new Date(timestamp).getTime()) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fechaLocal) ||
      !resolved.valores ||
      typeof resolved.valores !== 'object' ||
      (resolved.granularidad !== 'hourly' && resolved.granularidad !== 'daily')
    ) {
      return undefined;
    }

    return {
      ...resolved,
      valores: resolved.valores,
      fuentePorVariable:
        resolved.fuentePorVariable &&
        typeof resolved.fuentePorVariable === 'object'
          ? resolved.fuentePorVariable
          : {},
      estadoPorVariable:
        resolved.estadoPorVariable &&
        typeof resolved.estadoPorVariable === 'object'
          ? resolved.estadoPorVariable
          : {},
      banderasCalidad: Array.isArray(resolved.banderasCalidad)
        ? resolved.banderasCalidad
        : [],
    };
  }

  private safeWeatherContextKey(value: string): string {
    return String(value).replace(/[.$]/g, '_');
  }

  private async persistInBatches(
    indicators: ICreateIndicadorAgrometeorologico[],
    size = INDICATOR_PERSIST_BATCH_SIZE,
  ): Promise<void> {
    for (let index = 0; index < indicators.length; index += size) {
      await this.repository.upsertIndicadores(
        indicators.slice(index, index + size),
      );
    }
  }

  private resolveCoordinates(
    siembra: ISiembra,
    lote: ILote,
    establecimiento: { ubicacion?: Array<{ centro?: ICoordenadas }> },
  ): ICoordenadas | undefined {
    const coordinates =
      lote.ubicacion?.centro ||
      siembra.coordenadas ||
      establecimiento.ubicacion?.find((item) => item?.centro)?.centro;
    return coordinates &&
      Number.isFinite(+coordinates.lat) &&
      Number.isFinite(+coordinates.lng)
      ? { lat: +coordinates.lat, lng: +coordinates.lng }
      : undefined;
  }

  private findEmergenceDate(
    records?: IRegistroFenologico[],
  ): string | undefined {
    return this.activePhenologyRecords(records)
      .filter(
        (item) =>
          this.phenologyRecordCanDriveDecision(item) &&
          this.normalize(item.etapa).includes('emerg'),
      )
      .map((item) =>
        String(
          item.fechaInicioEtapa || item.fechaObservacion || item.fecha || '',
        ).slice(0, 10),
      )
      .filter((item): item is string => !!item)
      .sort()[0];
  }

  private activePhenologyRecords(
    records?: IRegistroFenologico[],
  ): IRegistroFenologico[] {
    const all = [...(records || [])];
    const replaced = new Set(
      all
        .map((record) => record.reemplazaRegistroId)
        .filter((id): id is string => !!id),
    );
    return all.filter((record) => !record.id || !replaced.has(record.id));
  }

  private hasBiofixObjectiveOnDate(
    siembra: ISiembra,
    date: string,
    objective: string,
  ): boolean {
    return this.activePhenologyRecords(siembra.registrosFenologicos).some(
      (record) =>
        record.tipoEvento === 'biofix' &&
        this.phenologyRecordCanDriveDecision(record) &&
        (record.objetivosBiofix || []).some(
          (item) => String(item) === objective,
        ) &&
        String(
          record.fechaInicioEtapa ||
            record.fechaObservacion ||
            record.fecha ||
            '',
        ).slice(0, 10) === date,
    );
  }

  private resolveOperationalReferenceDate(
    observations: IObservacionMeteorologicaNormalizada[],
    timezone: string,
  ): string {
    const today = this.localDateInTimezone(new Date(), timezone);
    const observedDates = observations
      .filter((item) => this.observationHasObservedOrEstimatedValue(item))
      .map((item) => item.fechaLocal)
      .filter((date) => !!date && date <= today)
      .sort();
    return observedDates[observedDates.length - 1] || today;
  }

  private observationHasObservedOrEstimatedValue(
    observation: IObservacionMeteorologicaNormalizada,
  ): boolean {
    if (!observation.esPronostico) return true;
    return Object.values(observation.estadoPorVariable || {}).some(
      (state) => state === 'observed' || state === 'estimated',
    );
  }

  private observationContainsForecast(
    observation?: IObservacionMeteorologicaNormalizada,
  ): boolean {
    return !!(
      observation &&
      (observation.esPronostico ||
        observation.estado === 'forecast' ||
        Object.values(observation.estadoPorVariable || {}).includes('forecast'))
    );
  }

  private isDecisionTemperature(
    observation: IObservacionMeteorologicaNormalizada,
  ): boolean {
    if (!Number.isFinite(observation.valores?.temperatureC)) return false;
    const state =
      observation.estadoPorVariable?.temperatureC || observation.estado;
    return state !== 'invalid' && state !== 'missing';
  }

  private isDecisionHumidity(
    observation: IObservacionMeteorologicaNormalizada,
  ): boolean {
    if (!Number.isFinite(observation.valores?.relativeHumidityPct))
      return false;
    const state =
      observation.estadoPorVariable?.relativeHumidityPct || observation.estado;
    return state !== 'invalid' && state !== 'missing';
  }

  private isDecisionHumidityDerivedVariable(
    observation: IObservacionMeteorologicaNormalizada,
    variable: 'dewPointC' | 'vpdKpa',
  ): boolean {
    if (!Number.isFinite(observation.valores?.[variable])) return false;
    const state =
      observation.estadoPorVariable?.[variable] || observation.estado;
    return state !== 'invalid' && state !== 'missing';
  }

  private isObservedDecisionTemperature(
    observation: IObservacionMeteorologicaNormalizada,
  ): boolean {
    if (!this.isDecisionTemperature(observation)) return false;
    const explicitState = observation.estadoPorVariable?.temperatureC;
    if (explicitState) {
      return explicitState !== 'forecast';
    }
    return observation.estado !== 'forecast' && !observation.esPronostico;
  }

  private isObservedFieldTemperature(
    observation: IObservacionMeteorologicaNormalizada,
  ): boolean {
    if (!Number.isFinite(observation.valores?.temperatureC)) return false;
    const source = String(
      observation.fuentePorVariable?.temperatureC || observation.fuente || '',
    );
    if (!source.includes('sensor')) return false;
    if (
      (observation.banderasCalidad || []).includes(
        'temperature_sensor_quality:rechazado',
      )
    ) {
      return false;
    }
    const state =
      observation.estadoPorVariable?.temperatureC || observation.estado;
    return (
      state !== 'forecast' &&
      state !== 'missing' &&
      state !== 'invalid' &&
      !observation.esPronostico
    );
  }

  private resolveCoverageEndTimestamp(
    timezone: string,
    windowEndDate?: string,
  ): string {
    const now = new Date();
    const lastClosedHour = new Date(
      Math.floor(now.getTime() / HOUR_MS) * HOUR_MS - HOUR_MS,
    );
    const lastClosedLocalDate = this.localDateInTimezone(
      lastClosedHour,
      timezone,
    );
    if (windowEndDate && windowEndDate < lastClosedLocalDate) {
      return (
        this.lastHourlySlotForLocalDate(windowEndDate, timezone) ||
        lastClosedHour.toISOString()
      );
    }
    return lastClosedHour.toISOString();
  }

  private firstHourlySlotForLocalDate(
    date: string,
    timezone: string,
  ): string | undefined {
    return this.hourlySlotsForLocalDate(date, timezone)[0]?.toISOString();
  }

  private lastHourlySlotForLocalDate(
    date: string,
    timezone: string,
  ): string | undefined {
    return this.hourlySlotsForLocalDate(date, timezone)
      .slice()
      .reverse()[0]
      ?.toISOString();
  }

  private hourlySlotsForLocalDate(date: string, timezone: string): Date[] {
    const anchor = new Date(`${date}T12:00:00.000Z`).getTime();
    if (!Number.isFinite(anchor)) return [];
    const slots: Date[] = [];
    for (let offset = -36; offset <= 36; offset += 1) {
      const instant = new Date(anchor + offset * HOUR_MS);
      if (this.localDateInTimezone(instant, timezone) === date) {
        slots.push(instant);
      }
    }
    return slots.sort((left, right) => left.getTime() - right.getTime());
  }

  private derivedSource(
    dailySource: FuenteMeteorologicaNormalizada | undefined,
    sourceByVariable: IDailyDerived['sourceByVariable'],
  ): FuenteMeteorologicaNormalizada {
    const sources = new Set(
      [dailySource, ...Object.values(sourceByVariable)].filter(Boolean),
    );
    const sensor = [...sources].some((value) =>
      String(value).includes('sensor'),
    );
    const other = [...sources].some(
      (value) => !String(value).includes('sensor') && value !== undefined,
    );
    if (sensor) return other ? 'mixed' : 'derived_sensor';
    return sources.has('station') || sources.has('derived_station')
      ? sources.has('open_meteo') || sources.has('derived_open_meteo')
        ? 'mixed'
        : 'derived_station'
      : 'derived_open_meteo';
  }

  private derivedSourceFromHours(
    hours: IObservacionMeteorologicaNormalizada[],
    variable: VariableMeteorologicaNormalizada,
  ): FuenteMeteorologicaNormalizada | undefined {
    const sources = new Set(
      hours
        .filter((item) => this.hasUsableWeatherValue(item.valores[variable]))
        .map((item) => item.fuentePorVariable[variable])
        .filter((value): value is FuenteMeteorologicaNormalizada => !!value),
    );
    const sensor = [...sources].some((value) =>
      String(value).includes('sensor'),
    );
    const station = [...sources].some((value) => value.includes('station'));
    const open = [...sources].some(
      (value) => value.includes('open_meteo') || value === 'gap_filled',
    );
    if (sources.has('mixed')) return 'mixed';
    if (sensor && (station || open)) return 'mixed';
    if (sensor) return 'derived_sensor';
    if (station && open) return 'mixed';
    if (station) return 'derived_station';
    if (open) return 'derived_open_meteo';
    return undefined;
  }

  private hourlyCoveragePct(
    hours: IObservacionMeteorologicaNormalizada[],
    variable: VariableMeteorologicaNormalizada,
  ): number | undefined {
    const intervals = new Set(
      hours
        .filter((item) => this.hasUsableWeatherValue(item.valores[variable]))
        .map((item) => item.timestamp.slice(0, 13)),
    );
    const reference = hours.find((item) => item.fechaLocal && item.timezone);
    const expectedSlots = reference
      ? this.expectedHourlySlots(reference.fechaLocal, reference.timezone)
      : 24;
    return intervals.size
      ? clamp((intervals.size / expectedSlots) * 100, 0, 100)
      : undefined;
  }

  private expectedHourlySlots(date: string, timezone: string): number {
    const anchor = new Date(`${date}T12:00:00.000Z`).getTime();
    if (!Number.isFinite(anchor)) return 24;
    let slots = 0;
    for (let offset = -36; offset <= 36; offset += 1) {
      const instant = new Date(anchor + offset * 3600000);
      if (this.localDateInTimezone(instant, timezone) === date) slots += 1;
    }
    return slots || 24;
  }

  private localDateInTimezone(date: Date, timezone: string): string {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(date);
      const values = Object.fromEntries(
        parts.map((part) => [part.type, part.value]),
      );
      return `${values.year}-${values.month}-${values.day}`;
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }

  private highestSourcePriorityFromHours(
    hours: IObservacionMeteorologicaNormalizada[],
    variable: VariableMeteorologicaNormalizada,
  ): number | undefined {
    const priorities = hours
      .filter((item) => this.hasUsableWeatherValue(item.valores[variable]))
      .map((item) =>
        this.weatherSourcePriority(
          item.fuentePorVariable[variable] || item.fuente,
        ),
      )
      .filter((priority) => priority > 0);
    return priorities.length ? Math.max(...priorities) : undefined;
  }

  private hasUsableWeatherValue(value: unknown): boolean {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') return value.trim().length > 0;
    return !!(
      value &&
      typeof value === 'object' &&
      Object.values(value as Record<string, unknown>).some(
        (item) => typeof item === 'number' && Number.isFinite(item),
      )
    );
  }

  private weatherSourcePriority(
    source: FuenteMeteorologicaNormalizada | undefined,
  ): number {
    const normalized = String(source || '');
    if (normalized.includes('sensor')) return 3;
    if (normalized.includes('station') || normalized === 'mixed') return 2;
    if (normalized.includes('open_meteo') || normalized === 'gap_filled') {
      return 1;
    }
    return 0;
  }

  private combineDerivedSources(
    first?: FuenteMeteorologicaNormalizada,
    second?: FuenteMeteorologicaNormalizada,
  ): FuenteMeteorologicaNormalizada | undefined {
    if (!first) return second;
    if (!second) return first;
    if (first === second) return first;
    return 'mixed';
  }

  private resolveOverallSource(
    daily: FuenteMeteorologicaNormalizada | undefined,
    sourceByVariable: Partial<
      Record<VariableMeteorologicaNormalizada, FuenteMeteorologicaNormalizada>
    >,
  ): FuenteMeteorologicaNormalizada {
    const sources = new Set(
      [daily, ...Object.values(sourceByVariable)].filter(Boolean),
    );
    const sensor = [...sources].some((value) =>
      String(value).includes('sensor'),
    );
    const station = [...sources].some((value) =>
      String(value).includes('station'),
    );
    const open = [...sources].some(
      (value) => String(value).includes('open_meteo') || value === 'gap_filled',
    );
    if (sensor && (station || open)) return 'mixed';
    if (sensor) return 'sensor';
    if (station && open) return 'mixed';
    if (station) return 'station';
    return 'open_meteo';
  }

  private completenessForIndicator(
    metrics: IMetricasAgrometeorologicasDiarias,
  ): number {
    const required: Array<keyof IMetricasAgrometeorologicasDiarias> = [
      'temperatureMinC',
      'temperatureMeanC',
      'temperatureMaxC',
      'gddDaily',
      'photoperiodHours',
      'vpdMeanKpa',
      'et0Mm',
      'precipitationMm',
      'solarRadiationMjM2',
    ];
    const present = required.filter(
      (key) => metrics[key] !== undefined && metrics[key] !== null,
    ).length;
    return Math.round((present / required.length) * 1000) / 10;
  }

  private averageLayerMaps(
    maps: Array<Record<string, number> | undefined>,
  ): Record<string, number> | undefined {
    const values = new Map<string, number[]>();
    for (const map of maps) {
      for (const [key, value] of Object.entries(map || {})) {
        if (!Number.isFinite(value)) continue;
        values.set(key, [...(values.get(key) || []), value]);
      }
    }
    const result: Record<string, number> = {};
    values.forEach((items, key) => {
      result[key] = this.mean(items) as number;
    });
    return Object.keys(result).length ? result : undefined;
  }

  private values(
    observations: IObservacionMeteorologicaNormalizada[],
    key: keyof IValoresMeteorologicosNormalizados,
  ): number[] {
    return observations
      .map((item) => item.valores[key])
      .filter(
        (value): value is number =>
          typeof value === 'number' && Number.isFinite(value),
      );
  }

  private rollingSum(
    history: Array<{ date: string; value?: number }>,
    date: string,
    days: number,
  ): number | undefined {
    const from = new Date(`${date}T12:00:00Z`);
    from.setUTCDate(from.getUTCDate() - (days - 1));
    const requestedFrom = from.toISOString().slice(0, 10);
    const firstHistoryDate = history
      .map((item) => item.date)
      .filter(Boolean)
      .sort()[0];
    if (!firstHistoryDate) return undefined;
    const effectiveFrom =
      firstHistoryDate > requestedFrom ? firstHistoryDate : requestedFrom;
    const byDate = new Map(
      history
        .filter((item) => item.date >= effectiveFrom && item.date <= date)
        .map((item) => [item.date, item.value]),
    );
    const values: number[] = [];
    const cursor = new Date(`${effectiveFrom}T12:00:00Z`);
    const end = new Date(`${date}T12:00:00Z`);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      const value = byDate.get(key);
      if (!esNumeroFinito(value)) return undefined;
      values.push(value);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return values.length ? this.sum(values) : undefined;
  }

  private rollingMean(
    history: Array<{ date: string; value?: number }>,
    date: string,
    days: number,
  ): number | undefined {
    const sum = this.rollingSum(history, date, days);
    if (sum === undefined) return undefined;
    const from = new Date(`${date}T12:00:00Z`);
    from.setUTCDate(from.getUTCDate() - (days - 1));
    const count = history.filter(
      (item) =>
        item.date >= from.toISOString().slice(0, 10) &&
        item.date <= date &&
        esNumeroFinito(item.value),
    ).length;
    return count ? sum / count : undefined;
  }

  private min(values: number[]): number | undefined {
    return values.length ? Math.min(...values) : undefined;
  }

  private max(values: number[]): number | undefined {
    return values.length ? Math.max(...values) : undefined;
  }

  private mean(values: number[]): number | undefined {
    return values.length ? this.sum(values) / values.length : undefined;
  }

  private sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
  }

  private daysBetween(from?: string, to?: string): number {
    if (!from || !to) return 0;
    return Math.max(
      0,
      Math.floor(
        (new Date(`${to.slice(0, 10)}T12:00:00Z`).getTime() -
          new Date(`${from.slice(0, 10)}T12:00:00Z`).getTime()) /
          86400000,
      ),
    );
  }

  private calendarDateSequence(from: string, to: string): string[] {
    const start = new Date(`${String(from).slice(0, 10)}T00:00:00.000Z`);
    const end = new Date(`${String(to).slice(0, 10)}T00:00:00.000Z`);
    const days = (end.getTime() - start.getTime()) / 86400000;
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      !Number.isInteger(days) ||
      days < 0 ||
      days > 5000
    ) {
      throw new Error(
        'La ventana meteorologica esperada es invalida o excede el limite operativo.',
      );
    }
    return Array.from({ length: days + 1 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
  }

  private generationDatesChecksum(
    idSiembra: string,
    versionCalculo: string,
    dates: string[],
  ): string {
    return createHash('sha256')
      .update(`${idSiembra}|${versionCalculo}|${dates.join(',')}`)
      .digest('hex');
  }

  private perennialCampaignStart(date: string): string {
    const parsed = new Date(`${date}T12:00:00Z`);
    const year =
      parsed.getUTCMonth() >= 6
        ? parsed.getUTCFullYear()
        : parsed.getUTCFullYear() - 1;
    return `${year}-07-01`;
  }

  private perennialColdSeasonStart(date: string): string {
    const parsed = new Date(`${date}T12:00:00Z`);
    const year =
      parsed.getUTCMonth() >= 4
        ? parsed.getUTCFullYear()
        : parsed.getUTCFullYear() - 1;
    return `${year}-05-01`;
  }

  private normalize(value?: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private humanizeStage(value: string): string {
    return String(value || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}
