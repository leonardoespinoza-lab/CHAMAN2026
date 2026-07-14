import { Injectable, Logger } from '@nestjs/common';
import SunCalc from 'suncalc';
import {
  AGROMET_DEFAULT_PARAMETERS_VERSION,
  AGROMET_ENGINE_VERSION,
  calcularBalanceHidrico,
  calcularCapacidadAguaUtilMm,
  calcularEt0Fao56,
  calcularFotoperiodoHoras,
  calcularGdd,
  calcularMojadoFoliarEstimado,
  calcularPuntoRocioC,
  calcularVpdKpa,
  clamp,
  diaDelAnio,
  esCultivoPerenne,
  esNumeroFinito,
  FuenteMeteorologicaNormalizada,
  ICoordenadas,
  ICreateIndicadorAgrometeorologico,
  ILote,
  IMetricasAgrometeorologicasDiarias,
  IObservacionMeteorologicaNormalizada,
  IParametrosAgrometeorologicos,
  IRegistroFenologico,
  IRespuestaAgrometeorologiaSiembra,
  ISerieAgrometeorologicaDia,
  ISiembra,
  IValoresMeteorologicosNormalizados,
  normalizarContenidoVolumetrico,
  numeroFinito,
  PARAMETROS_AGROMETEOROLOGICOS_REFERENCIA,
  promedioPonderadoZonaRadicular,
  resolverKc,
  VariableMeteorologicaNormalizada,
} from 'modelos/src';
import { AgrometeorologiaRepository } from './repository';
import { WeatherIngestionService } from './weather-ingestion.service';

const INDICATOR_PERSIST_BATCH_SIZE = 100;
import { AGROMETEO_FORECAST_MAX_AGE_HOURS } from '../../env';

interface ISoilProfile {
  capacityMm?: number;
  fieldCapacity?: number;
  wiltingPoint?: number;
  rootDepthCm?: number;
  estimated: boolean;
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
  vernalizationUnits?: number;
  leafWetnessHours?: number;
  maxContinuousLeafWetnessHours?: number;
  meanTemperatureDuringLeafWetnessC?: number;
  solarRadiationMjM2?: number;
  et0Mm?: number;
  rootZoneSoilTemperatureC?: number;
  rootZoneSoilMoistureM3M3?: number;
  soilTemperatureC?: Record<string, number>;
  soilMoistureM3M3?: Record<string, number>;
  sourceByVariable: Partial<
    Record<VariableMeteorologicaNormalizada, FuenteMeteorologicaNormalizada>
  >;
}

@Injectable()
export class AgrometeorologicalEngineService {
  private readonly logger = new Logger(AgrometeorologicalEngineService.name);

  constructor(
    private repository: AgrometeorologiaRepository,
    private ingestion: WeatherIngestionService,
  ) {}

  async procesarSiembra(
    idSiembra: string,
    options: { sincronizarClima?: boolean; forceBackfill?: boolean } = {},
  ): Promise<{ indicadores: number; advertencias: string[] }> {
    const siembra = await this.repository.getSiembra(idSiembra);
    if (!siembra?._id || !siembra.fechaSiembra) {
      throw new Error('La siembra no existe o no tiene fecha de implantacion.');
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
      throw new Error('La siembra no tiene lote o establecimiento resoluble.');
    }
    const cycleStart = this.resolveCycleStart(siembra);
    const coordinates = this.resolveCoordinates(siembra, lote, establecimiento);
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
    if (options.sincronizarClima !== false) {
      const sync = await this.ingestion.sincronizar(
        establecimiento,
        coordinates,
        cycleStart,
        options.forceBackfill,
      );
      syncWarnings.push(...sync.advertencias);
    }
    const observations = await this.loadObservations(
      establecimiento._id,
      cycleStart,
    );
    const calculated = this.calculateIndicators(
      siembra,
      lote,
      coordinates,
      observations,
      syncWarnings,
    );
    await this.persistInBatches(calculated);
    const warnings = [
      ...new Set(calculated.flatMap((item) => item.advertencias)),
    ];
    this.logger.log(
      JSON.stringify({
        event: 'agromet_sowing_processed',
        idSiembra,
        indicators: calculated.length,
        warnings: warnings.length,
        engineVersion: AGROMET_ENGINE_VERSION,
      }),
    );
    return { indicadores: calculated.length, advertencias: warnings };
  }

  /**
   * Separa la fecha historica de implantacion del inicio de la campaña que
   * corresponde recalcular. En perennes la implantacion define la edad del
   * monte, pero los acumulados operativos se reinician cada campaña julio-junio.
   */
  resolveCycleStart(siembra: ISiembra, referenceDate?: string): string {
    const implantationDate = String(siembra.fechaSiembra || '').slice(0, 10);
    if (!esCultivoPerenne(siembra.semilla?.cultivo)) return implantationDate;
    const currentReference =
      referenceDate || new Date().toISOString().slice(0, 10);
    const campaignStart = this.perennialCampaignStart(currentReference);
    return implantationDate > campaignStart ? implantationDate : campaignStart;
  }

  calculateIndicators(
    siembra: ISiembra,
    lote: ILote,
    coordinates: ICoordenadas,
    observations: IObservacionMeteorologicaNormalizada[],
    inheritedWarnings: string[] = [],
  ): ICreateIndicadorAgrometeorologico[] {
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
    const globalWarnings = [...inheritedWarnings];
    if (!crop) globalWarnings.push('La siembra no tiene cultivo asociado.');
    if (!custom) {
      globalWarnings.push(
        'Se usan parametros agronomicos de referencia; calibrar Kc y umbrales para la variedad y el manejo local.',
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
    const dates = [
      ...new Set([
        ...dailyPersisted.map((item) => item.fechaLocal),
        ...hourlyByDate.keys(),
      ]),
    ].sort();
    if (!dates.length) return [];
    const dailyByDate = new Map(
      dailyPersisted.map((item) => [item.fechaLocal, item]),
    );
    const profile = this.resolveSoilProfile(lote, parameters);
    if (!profile.capacityMm) {
      globalWarnings.push(
        'Balance hidrico no calculable: faltan capacidad de campo, punto de marchitez o profundidad radicular.',
      );
    } else if (profile.estimated) {
      globalWarnings.push(
        'La capacidad de agua util usa una referencia del lote o cultivo y requiere validacion de perfil.',
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
    let currentStage = '';
    let chillingAccumulated = 0;
    let vernalizationAccumulated = 0;
    let radiationAccumulated = 0;
    let et0Accumulated = 0;
    let etcAccumulated = 0;
    let rainAccumulated = 0;
    let rainyDays = 0;
    let dryDays = 0;
    let storage = this.initialStorageFromSowing(siembra, profile.capacityMm);
    let previousPhotoperiod: number | undefined;
    const emergenceDate = this.findEmergenceDate(siembra.registrosFenologicos);
    const rainfallHistory: Array<{ date: string; value?: number }> = [];
    const radiationHistory: Array<{ date: string; value?: number }> = [];
    const results: ICreateIndicadorAgrometeorologico[] = [];
    const cycleStart = this.resolveCycleStart(siembra);

    for (const date of dates) {
      if (date < cycleStart) continue;
      const daily = dailyByDate.get(date);
      const hours = hourlyByDate.get(date) || [];
      const thresholds = this.resolveThresholds(
        parameters,
        this.resolveStage(siembra, date, gddAccumulated),
      );
      const derived = this.deriveHourlyDay(
        hours,
        thresholds,
        parameters,
        profile.rootDepthCm,
      );
      const weather = this.mergeDailyWeather(daily?.valores, derived);
      const stage = this.resolveStage(siembra, date, gddAccumulated);
      if (stage !== currentStage) {
        currentStage = stage;
        gddStage = 0;
      }
      const gdd = calcularGdd({
        temperatureMinC: weather.temperatureMinC,
        temperatureMaxC: weather.temperatureMaxC,
        baseTemperatureC: parameters.temperaturaBaseC,
        upperTemperatureC: parameters.temperaturaSuperiorC,
      });
      if (gdd !== undefined) {
        gddAccumulated += gdd;
        gddStage += gdd;
        if (emergenceDate && date >= emergenceDate) gddFromEmergence += gdd;
      }
      const photoperiod =
        weather.daylightDurationHours ??
        calcularFotoperiodoHoras(date, coordinates.lat);
      const solarTimes = this.solarTimes(date, coordinates, daily?.timezone);
      const chilling = derived.chillingHours;
      const vernalization = derived.vernalizationUnits;
      if (chilling !== undefined) chillingAccumulated += chilling;
      if (vernalization !== undefined)
        vernalizationAccumulated += vernalization;

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
      if (radiation !== undefined) radiationAccumulated += radiation;
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
      if (et0 !== undefined) et0Accumulated += et0;
      const progress = this.cycleProgress(siembra, date);
      const kc = resolverKc(parameters, progress, stage);
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
      }
      rainfallHistory.push({ date, value: precipitation });
      const irrigation = irrigationByDate.get(date);

      const rootMoisture =
        derived.rootZoneSoilMoistureM3M3 ??
        promedioPonderadoZonaRadicular(
          weather.soilMoistureM3M3,
          profile.rootDepthCm,
        );
      const rootTemperature =
        derived.rootZoneSoilTemperatureC ??
        promedioPonderadoZonaRadicular(
          weather.soilTemperatureC,
          profile.rootDepthCm,
        );
      const measuredStorage = this.storageFromSoilMoisture(
        rootMoisture,
        profile,
      );
      if (measuredStorage !== undefined) storage = measuredStorage;
      const balance = calcularBalanceHidrico({
        previousStorageMm: storage,
        availableWaterCapacityMm: profile.capacityMm,
        precipitationMm: precipitation,
        irrigationMm: irrigation ?? 0,
        etcMm: etc,
        effectiveRainCoefficient: parameters.coeficientePrecipitacionEfectiva,
        runoffCoefficient: parameters.coeficienteEscurrimiento,
        drainageCoefficient: parameters.coeficienteDrenaje,
      });
      if (balance.storageMm !== undefined) storage = balance.storageMm;

      const dayWarnings = [...globalWarnings];
      if (gdd === undefined)
        dayWarnings.push(
          'GDD no calculable: falta temperatura o temperatura base.',
        );
      if (kc === undefined)
        dayWarnings.push(
          'ETc no calculable: faltan parametros Kc para la etapa.',
        );
      if (et0 === undefined)
        dayWarnings.push(
          'ET0 no disponible ni calculable con las variables existentes.',
        );
      if ((daily?.completitudPct ?? 0) < 70) {
        dayWarnings.push('Cobertura meteorologica incompleta para este dia.');
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
        gddAccumulated,
        gddFromEmergence: emergenceDate ? gddFromEmergence : undefined,
        gddCurrentStage: gddStage,
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
        vernalizationUnits: vernalization,
        vernalizationAccumulated:
          vernalization !== undefined ? vernalizationAccumulated : undefined,
        relativeHumidityMinPct: weather.relativeHumidityMinPct,
        relativeHumidityMeanPct: weather.relativeHumidityMeanPct,
        relativeHumidityMaxPct: weather.relativeHumidityMaxPct,
        dewPointC: dewPoint,
        vpdMeanKpa: vpdMean,
        vpdMaxKpa: vpdMax,
        vpdStressHours: derived.vpdStressHours,
        solarRadiationMjM2: radiation,
        solarRadiationAccumulatedMjM2:
          radiation !== undefined ? radiationAccumulated : undefined,
        sunshineDurationHours: weather.sunshineDurationHours,
        radiationRollingMean7d: this.rollingMean(radiationHistory, date, 7),
        et0Mm: et0,
        et0AccumulatedMm: et0 !== undefined ? et0Accumulated : undefined,
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
        rainAccumulatedMm:
          precipitation !== undefined ? rainAccumulated : undefined,
        rain7dMm: this.rollingSum(rainfallHistory, date, 7),
        rain15dMm: this.rollingSum(rainfallHistory, date, 15),
        rain30dMm: this.rollingSum(rainfallHistory, date, 30),
        rainyDaysAccumulated:
          precipitation !== undefined ? rainyDays : undefined,
        consecutiveDryDays: precipitation !== undefined ? dryDays : undefined,
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
      const sourceByVariable = { ...(daily?.fuentePorVariable || {}) };
      for (const [key, source] of Object.entries(derived.sourceByVariable)) {
        const variable = key as VariableMeteorologicaNormalizada;
        if ((daily?.valores as any)?.[variable] === undefined && source) {
          sourceByVariable[variable] = source;
        }
      }
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
          daily?.esPronostico ?? hours.some((item) => item.esPronostico),
        etapaFenologica: stage || undefined,
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
          ]),
        ],
        advertencias: [...new Set(dayWarnings)],
        completitudPct: this.completenessForIndicator(metrics),
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
    const indicators = await this.repository.getIndicadores({
      filter: JSON.stringify(filter),
      sort: JSON.stringify({ fecha: 1 }),
      limit: 0,
    });
    const indicatorForecastCutoff =
      Date.now() - AGROMETEO_FORECAST_MAX_AGE_HOURS * 3600000;
    const rows = (indicators.datos || []).filter(
      (item) =>
        !item.esPronostico ||
        new Date(item.calculadoEn).getTime() >= indicatorForecastCutoff,
    );
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
    const weatherByDate = new Map(
      (observations.datos || []).map((item) => [item.fechaLocal, item]),
    );
    const series: ISerieAgrometeorologicaDia[] = rows.map((item) => {
      const weather = weatherByDate.get(item.fecha);
      return {
        date: item.fecha,
        isForecast: item.esPronostico,
        stage: item.etapaFenologica,
        weather: weather?.valores || {},
        metrics: item.metricas,
        source: item.fuente,
        sourceByVariable: item.fuentePorVariable,
        qualityFlags: item.banderasCalidad,
        warnings: item.advertencias,
      };
    });
    const today = new Date().toISOString().slice(0, 10);
    const latestObserved =
      [...rows]
        .reverse()
        .find((item) => !item.esPronostico && item.fecha <= today) || rows[0];
    const current = rows.find((item) => item.fecha === today) || latestObserved;
    const stationNames = (observations.datos || [])
      .map((item) => item.estacionNombre)
      .filter((value): value is string => !!value);
    const sourceTypes = new Set(rows.map((item) => item.fuente));
    const dataSourceType =
      sourceTypes.has('mixed') ||
      (sourceTypes.has('station') && sourceTypes.has('open_meteo'))
        ? 'mixed'
        : sourceTypes.has('station')
          ? 'station'
          : 'open_meteo';
    return {
      summary: {
        gddAccumulated: latestObserved.metricas.gddAccumulated,
        rainAccumulatedMm: latestObserved.metricas.rainAccumulatedMm,
        et0AccumulatedMm: latestObserved.metricas.et0AccumulatedMm,
        etcAccumulatedMm: latestObserved.metricas.etcAccumulatedMm,
        availableWaterPercentage:
          latestObserved.metricas.availableWaterPercentage,
        waterDeficitMm: latestObserved.metricas.waterDeficitMm,
        vpdMeanKpa: current.metricas.vpdMeanKpa,
        currentPhotoperiodHours: current.metricas.photoperiodHours,
      },
      dataSource: {
        type: dataSourceType,
        stationName: stationNames[0],
        lastObservationAt: (observations.datos || [])
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
      },
      series,
      warnings: [...new Set(rows.flatMap((item) => item.advertencias))],
      calculationVersion: AGROMET_ENGINE_VERSION,
      parametersVersion: current.versionParametros,
    };
  }

  private deriveHourlyDay(
    hours: IObservacionMeteorologicaNormalizada[],
    thresholds: { coldC: number; heatC: number; vpdKpa: number },
    parameters: IParametrosAgrometeorologicos,
    rootDepthCm?: number,
  ): IDailyDerived {
    const temperatures = this.values(hours, 'temperatureC');
    const humidity = this.values(hours, 'relativeHumidityPct');
    const precipitation = this.values(hours, 'precipitationMm');
    const vpdValues = hours
      .map(
        (item) =>
          item.valores.vpdKpa ??
          calcularVpdKpa(
            item.valores.temperatureC,
            item.valores.relativeHumidityPct,
          ),
      )
      .filter((value): value is number => esNumeroFinito(value));
    const dewPoints = hours
      .map(
        (item) =>
          item.valores.dewPointC ??
          calcularPuntoRocioC(
            item.valores.temperatureC,
            item.valores.relativeHumidityPct,
          ),
      )
      .filter((value): value is number => esNumeroFinito(value));
    const wetness = calcularMojadoFoliarEstimado(
      hours.map((item) => ({
        temperatureC: item.valores.temperatureC,
        relativeHumidityPct: item.valores.relativeHumidityPct,
        dewPointC: item.valores.dewPointC,
        precipitationMm: item.valores.precipitationMm,
      })),
    );
    const radiation = this.values(hours, 'shortwaveRadiationWm2');
    const et0Hourly = this.values(hours, 'et0Mm');
    const soilTemperature = this.averageLayerMaps(
      hours.map((item) => item.valores.soilTemperatureC),
    );
    const soilMoisture = this.averageLayerMaps(
      hours.map((item) => item.valores.soilMoistureM3M3),
    );
    const sourceByVariable: IDailyDerived['sourceByVariable'] = {};
    const tempSource = this.derivedSourceFromHours(hours, 'temperatureC');
    const humiditySource = this.derivedSourceFromHours(
      hours,
      'relativeHumidityPct',
    );
    const rainSource = this.derivedSourceFromHours(hours, 'precipitationMm');
    const radiationSource = this.derivedSourceFromHours(
      hours,
      'shortwaveRadiationWm2',
    );
    if (tempSource) {
      sourceByVariable.temperatureMinC = tempSource;
      sourceByVariable.temperatureMeanC = tempSource;
      sourceByVariable.temperatureMaxC = tempSource;
    }
    if (humiditySource) {
      sourceByVariable.relativeHumidityMinPct = humiditySource;
      sourceByVariable.relativeHumidityMeanPct = humiditySource;
      sourceByVariable.relativeHumidityMaxPct = humiditySource;
    }
    if (rainSource) sourceByVariable.precipitationMm = rainSource;
    if (radiationSource)
      sourceByVariable.shortwaveRadiationMjM2 = radiationSource;
    if (vpdValues.length)
      sourceByVariable.vpdMeanKpa = this.combineDerivedSources(
        tempSource,
        humiditySource,
      );
    const vernalRange = parameters.rangoVernalizacionC;
    return {
      temperatureMinC: this.min(temperatures),
      temperatureMeanC: this.mean(temperatures),
      temperatureMaxC: this.max(temperatures),
      humidityMinPct: this.min(humidity),
      humidityMeanPct: this.mean(humidity),
      humidityMaxPct: this.max(humidity),
      dewPointC: this.mean(dewPoints),
      precipitationMm: precipitation.length
        ? this.sum(precipitation)
        : undefined,
      maxHourlyRainMm: this.max(precipitation),
      vpdMeanKpa: this.mean(vpdValues),
      vpdMaxKpa: this.max(vpdValues),
      coldHours: temperatures.length
        ? temperatures.filter((value) => value < thresholds.coldC).length
        : undefined,
      heatHours: temperatures.length
        ? temperatures.filter((value) => value > thresholds.heatC).length
        : undefined,
      vpdStressHours: vpdValues.length
        ? vpdValues.filter((value) => value > thresholds.vpdKpa).length
        : undefined,
      chillingHours: temperatures.length
        ? temperatures.filter((value) => value >= 0 && value <= 7.2).length
        : undefined,
      vernalizationUnits:
        temperatures.length && vernalRange
          ? temperatures.filter(
              (value) => value >= vernalRange.min && value <= vernalRange.max,
            ).length / 24
          : undefined,
      leafWetnessHours: wetness.hours,
      maxContinuousLeafWetnessHours: wetness.maxContinuousHours,
      meanTemperatureDuringLeafWetnessC: wetness.meanTemperatureC,
      solarRadiationMjM2: radiation.length
        ? this.sum(radiation) * 0.0036
        : undefined,
      et0Mm: et0Hourly.length ? this.sum(et0Hourly) : undefined,
      rootZoneSoilTemperatureC: promedioPonderadoZonaRadicular(
        soilTemperature,
        rootDepthCm,
      ),
      rootZoneSoilMoistureM3M3: promedioPonderadoZonaRadicular(
        soilMoisture,
        rootDepthCm,
      ),
      soilTemperatureC: soilTemperature,
      soilMoistureM3M3: soilMoisture,
      sourceByVariable,
    };
  }

  private mergeDailyWeather(
    persisted: IValoresMeteorologicosNormalizados | undefined,
    derived: IDailyDerived,
  ): IValoresMeteorologicosNormalizados {
    const values = { ...(persisted || {}) };
    const setIfMissing = (
      key: keyof IValoresMeteorologicosNormalizados,
      value: unknown,
    ) => {
      if ((values as any)[key] === undefined && value !== undefined) {
        (values as any)[key] = value;
      }
    };
    setIfMissing('temperatureMinC', derived.temperatureMinC);
    setIfMissing('temperatureMeanC', derived.temperatureMeanC);
    setIfMissing('temperatureMaxC', derived.temperatureMaxC);
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
    return values;
  }

  private resolveSoilProfile(
    lote: ILote,
    parameters: IParametrosAgrometeorologicos,
  ): ISoilProfile {
    const layers = [...(lote.suelos || [])]
      .filter((item) => item.hayRaices !== false)
      .map((item) => ({
        depth: numeroFinito(item.profundidad),
        fc: normalizarContenidoVolumetrico(item.capacidadDeCampo),
        wp: normalizarContenidoVolumetrico(item.puntoMarchitez),
      }))
      .filter(
        (item): item is { depth: number; fc: number; wp: number } =>
          item.depth !== undefined &&
          item.depth > 0 &&
          item.fc !== undefined &&
          item.wp !== undefined &&
          item.fc > item.wp,
      )
      .sort((a, b) => a.depth - b.depth);
    if (layers.length) {
      let previousDepth = 0;
      let capacity = 0;
      let weightedFc = 0;
      let weightedWp = 0;
      for (const layer of layers) {
        const thickness = Math.max(0, layer.depth - previousDepth);
        capacity += (layer.fc - layer.wp) * thickness * 10;
        weightedFc += layer.fc * thickness;
        weightedWp += layer.wp * thickness;
        previousDepth = layer.depth;
      }
      return {
        capacityMm: capacity > 0 ? capacity : undefined,
        fieldCapacity:
          previousDepth > 0 ? weightedFc / previousDepth : undefined,
        wiltingPoint:
          previousDepth > 0 ? weightedWp / previousDepth : undefined,
        rootDepthCm: previousDepth,
        estimated: false,
      };
    }
    const rootDepth =
      parameters.profundidadRadicularCm ?? lote.sueloReferencia?.profundidadCm;
    return {
      capacityMm: calcularCapacidadAguaUtilMm(
        lote.capacidadDeCampo,
        lote.puntoMarchitez,
        rootDepth,
      ),
      fieldCapacity: normalizarContenidoVolumetrico(lote.capacidadDeCampo),
      wiltingPoint: normalizarContenidoVolumetrico(lote.puntoMarchitez),
      rootDepthCm: rootDepth,
      estimated: true,
    };
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
    const value = numeroFinito(siembra.aguaUtilReal);
    if (value === undefined) return capacity;
    if (value <= 1) return clamp(value * capacity, 0, capacity);
    if (value <= 100) return clamp((value / 100) * capacity, 0, capacity);
    return clamp(value, 0, capacity);
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
      const key = date.toISOString().slice(0, 10);
      result.set(key, (result.get(key) || 0) + amount);
    }
    return result;
  }

  private resolveStage(
    siembra: ISiembra,
    date: string,
    accumulatedGdd: number,
  ): string {
    const field = [...(siembra.registrosFenologicos || [])]
      .filter(
        (item) => item.fecha && item.fecha.slice(0, 10) <= date && item.etapa,
      )
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
      .pop();
    if (field?.etapa) return field.etapa;
    const thermalRanges = siembra.semilla?.fenologiaReferencia?.rangosTermicos;
    if (thermalRanges) {
      const match = Object.entries(thermalRanges).find(
        ([, range]) =>
          accumulatedGdd >= range.min && accumulatedGdd <= range.max,
      );
      if (match) return this.humanizeStage(match[0]);
    }
    const stages = (siembra.crono?.etapas || {}) as Record<string, number>;
    const entries = Object.entries(stages).filter(([, value]) =>
      Number.isFinite(Number(value)),
    );
    if (!entries.length) return 'Ciclo en seguimiento';
    const days = this.daysBetween(siembra.fechaSiembra, date);
    if (esCultivoPerenne(siembra.semilla?.cultivo)) {
      const sorted = entries
        .map(([name, value]) => ({ name, day: Number(value) }))
        .sort((a, b) => a.day - b.day);
      const campaignStart = this.perennialCampaignStart(date);
      const campaignDay = this.daysBetween(campaignStart, date);
      return this.humanizeStage(
        [...sorted].reverse().find((item) => campaignDay >= item.day)?.name ||
          sorted[0].name,
      );
    }
    let accumulated = 0;
    let stage = entries[0][0];
    for (const [name, duration] of entries) {
      accumulated += Math.max(0, Number(duration));
      if (days >= accumulated) stage = name;
      else break;
    }
    return this.humanizeStage(stage);
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
    return result.datos || [];
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
    return [...(records || [])]
      .filter((item) => this.normalize(item.etapa).includes('emerg'))
      .map((item) => item.fecha?.slice(0, 10))
      .filter((item): item is string => !!item)
      .sort()[0];
  }

  private derivedSource(
    dailySource: FuenteMeteorologicaNormalizada | undefined,
    sourceByVariable: IDailyDerived['sourceByVariable'],
  ): FuenteMeteorologicaNormalizada {
    const sources = new Set(
      [dailySource, ...Object.values(sourceByVariable)].filter(Boolean),
    );
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
        .map((item) => item.fuentePorVariable[variable])
        .filter((value): value is FuenteMeteorologicaNormalizada => !!value),
    );
    const station = [...sources].some((value) => value.includes('station'));
    const open = [...sources].some(
      (value) => value.includes('open_meteo') || value === 'gap_filled',
    );
    if (station && open) return 'mixed';
    if (station) return 'derived_station';
    if (open) return 'derived_open_meteo';
    return undefined;
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
    const station = [...sources].some((value) =>
      String(value).includes('station'),
    );
    const open = [...sources].some(
      (value) => String(value).includes('open_meteo') || value === 'gap_filled',
    );
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
    const values = history
      .filter(
        (item) =>
          item.date >= from.toISOString().slice(0, 10) && item.date <= date,
      )
      .map((item) => item.value)
      .filter((value): value is number => esNumeroFinito(value));
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

  private perennialCampaignStart(date: string): string {
    const parsed = new Date(`${date}T12:00:00Z`);
    const year =
      parsed.getUTCMonth() >= 6
        ? parsed.getUTCFullYear()
        : parsed.getUTCFullYear() - 1;
    return `${year}-07-01`;
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
