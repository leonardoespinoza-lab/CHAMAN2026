import { Injectable, Logger } from '@nestjs/common';
import {
  EstadoDatoMeteorologico,
  FuenteMeteorologicaNormalizada,
  IAsignacionDispositivoLote,
  IDispositivo,
  ILote,
  IObservacionMeteorologicaNormalizada,
  IReporte,
  IValoresMeteorologicosNormalizados,
  normalizarContenidoVolumetrico,
  RolVariableMeteorologica,
  VariableMeteorologicaNormalizada,
} from 'modelos/src';
import { AgrometeorologiaRepository } from './repository';

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';
const REPORT_PAGE_SIZE = 5000;
const SENSOR_STALE_HOURS = 6;

export interface ISensorWeatherContext {
  observations: IObservacionMeteorologicaNormalizada[];
  /**
   * Serie horaria pura de los sensores asignados al lote. Se conserva junto
   * al overlay canónico para auditar el aporte LoRa y la cobertura de campo.
   */
  fieldObservations: IObservacionMeteorologicaNormalizada[];
  warnings: string[];
  fieldCoverageByDate: Map<string, number>;
  sensorNames: string[];
  fieldTemperatureSensorNames: string[];
  lastFieldObservationAt?: string;
  fieldTemperatureDecisionReady: boolean;
  fieldTemperatureQuality?: 'calificado' | 'referencia';
  unqualifiedTemperatureSensorNames: string[];
}

interface IHourlyBucket {
  timestamp: string;
  temperatures: number[];
  humidities: number[];
  soilTemperatures: Map<string, number[]>;
  soilMoistures: Map<string, number[]>;
  flags: string[];
  sensorNames: Set<string>;
}

@Injectable()
export class SensorWeatherOverlayService {
  private readonly logger = new Logger(SensorWeatherOverlayService.name);

  constructor(private readonly repository: AgrometeorologiaRepository) {}

  async overlay(
    lote: ILote,
    idEstablecimiento: string,
    from: string,
    base: IObservacionMeteorologicaNormalizada[],
  ): Promise<ISensorWeatherContext> {
    const idLote = String(lote._id || '');
    if (!idLote) return this.empty(base);

    const devices = await this.loadCandidateDevices(idLote, idEstablecimiento);
    const assigned = devices.filter((device) =>
      this.deviceCouldBelongToLot(device, idLote),
    );
    if (!assigned.length) return this.empty(base);

    const to = new Date();
    const buckets = new Map<string, IHourlyBucket>();
    const sensorNames = new Set<string>();
    const fieldTemperatureSensorNames = new Set<string>();
    const warnings: string[] = [];
    let lastFieldObservationAt: string | undefined;

    for (const device of assigned) {
      const reports = await this.loadReports(device, from, to.toISOString());
      let validAirReports = 0;
      let latestDeviceTemperatureReport: string | undefined;

      for (const report of reports) {
        const timestamp = this.reportTimestamp(report);
        if (
          !timestamp ||
          !this.isAssignedAt(device, idLote, timestamp) ||
          timestamp.slice(0, 10) < from.slice(0, 10)
        ) {
          continue;
        }
        // La validacion de la instalacion se realiza a campo por Chaman. Si el
        // dispositivo esta asignado al lote, su canal de temperatura de aire
        // es la fuente prioritaria. Solo se excluye un rol explicitamente
        // declarado como suelo para no confundir temperatura edafica con aire.
        const canUseTemperature =
          device.calificacionMeteorologica?.rolTemperatura !== 'suelo';
        const canUseHumidity = true;
        const airTemperature = canUseTemperature
          ? this.averageSensor(
              report,
              'Temperatura',
              this.finiteOffset(
                device.calificacionMeteorologica?.offsetTemperaturaC,
              ),
            )
          : undefined;
        const humidity = canUseHumidity
          ? this.averageSensor(
              report,
              'Humedad',
              this.finiteOffset(
                device.calificacionMeteorologica?.humedadRelativa?.offset,
              ),
            )
          : undefined;
        const soilTemperature = this.depthValues(
          report,
          'Temperatura Suelo',
          false,
        );
        const soilMoisture = this.depthValues(
          report,
          'Humedad Suelo Profundidad',
          true,
        );
        if (
          airTemperature === undefined &&
          humidity === undefined &&
          !soilTemperature.size &&
          !soilMoisture.size
        ) {
          continue;
        }

        const hour = this.floorHour(timestamp);
        const bucket =
          buckets.get(hour) ||
          this.newBucket(hour, device.nombre || device.deveui || 'Sensor');
        if (airTemperature !== undefined) {
          bucket.temperatures.push(airTemperature);
          validAirReports += 1;
          fieldTemperatureSensorNames.add(
            device.nombre || device.deveui || 'Sensor',
          );
          latestDeviceTemperatureReport =
            !latestDeviceTemperatureReport ||
            timestamp > latestDeviceTemperatureReport
              ? timestamp
              : latestDeviceTemperatureReport;
          lastFieldObservationAt =
            !lastFieldObservationAt || timestamp > lastFieldObservationAt
              ? timestamp
              : lastFieldObservationAt;
        }
        if (humidity !== undefined) {
          bucket.humidities.push(humidity);
        }
        this.appendDepthValues(bucket.soilTemperatures, soilTemperature);
        this.appendDepthValues(bucket.soilMoistures, soilMoisture);
        bucket.sensorNames.add(device.nombre || device.deveui || 'Sensor');
        buckets.set(hour, bucket);
      }

      const name = device.nombre || device.deveui || 'Sensor de campo';
      sensorNames.add(name);
      if (!validAirReports) {
        warnings.push(
          `${name}: no aporta temperatura de aire valida para el periodo; nunca se sustituye con temperatura de suelo.`,
        );
      }
      const latest = latestDeviceTemperatureReport;
      if (latest) {
        const ageHours = (Date.now() - new Date(latest).getTime()) / 3600000;
        if (ageHours > SENSOR_STALE_HOURS) {
          warnings.push(
            `${name}: ultima lectura de campo hace ${this.round(ageHours, 1)} h; se considera desconectado para el estado actual y las faltantes se completan con la siguiente fuente valida.`,
          );
        }
      }
    }

    const timezone = base[0]?.timezone || DEFAULT_TIMEZONE;
    const sensorObservations = [...buckets.values()]
      .map((bucket) =>
        this.toObservation(bucket, idEstablecimiento, timezone, lote),
      )
      .filter((item): item is IObservacionMeteorologicaNormalizada => !!item);
    const fieldCoverageByDate =
      this.calculateHourlyCoverageByDate(sensorObservations);
    const observations = this.merge(base, sensorObservations);
    const fieldTemperatureDecisionReady =
      sensorObservations.some((item) =>
        Number.isFinite(item.valores.temperatureC),
      );
    if (sensorObservations.length) {
      const coverageValues = [...fieldCoverageByDate.values()];
      const meanCoverage = coverageValues.length
        ? coverageValues.reduce((sum, value) => sum + value, 0) /
          coverageValues.length
        : 0;
      warnings.push(
        `Temperatura canonica del lote: sensor LoRa asignado prioritario y central/Open-Meteo solo para completar horas faltantes. Cobertura horaria de campo media ${this.round(meanCoverage, 1)}%.`,
      );
    }

    return {
      observations,
      fieldObservations: sensorObservations,
      warnings: [...new Set(warnings)],
      fieldCoverageByDate,
      sensorNames: [...sensorNames],
      fieldTemperatureSensorNames: [...fieldTemperatureSensorNames],
      lastFieldObservationAt,
      fieldTemperatureDecisionReady,
      fieldTemperatureQuality: sensorObservations.some((item) =>
        Number.isFinite(item.valores.temperatureC),
      )
        ? 'calificado'
        : undefined,
      // Campo legacy conservado para compatibilidad del contrato. La
      // validación de la instalación se realiza fuera del código.
      unqualifiedTemperatureSensorNames: [],
    };
  }

  private empty(
    observations: IObservacionMeteorologicaNormalizada[],
  ): ISensorWeatherContext {
    return {
      observations,
      fieldObservations: [],
      warnings: [],
      fieldCoverageByDate: new Map(),
      sensorNames: [],
      fieldTemperatureSensorNames: [],
      fieldTemperatureDecisionReady: false,
      unqualifiedTemperatureSensorNames: [],
    };
  }

  private async loadCandidateDevices(
    idLote: string,
    idEstablecimiento: string,
  ): Promise<IDispositivo[]> {
    try {
      const result = await this.repository.getDispositivos({
        filter: JSON.stringify({
          $or: [
            { idLote },
            { idEstablecimiento },
            { 'historialAsignacionesLote.idLote': idLote },
          ],
        }),
        limit: 0,
      });
      return result.datos || [];
    } catch (error) {
      this.logger.warn(
        `No se pudieron resolver sensores para el lote ${idLote}: ${error?.message || error}`,
      );
      return [];
    }
  }

  private async loadReports(
    device: IDispositivo,
    from: string,
    to: string,
  ): Promise<IReporte[]> {
    const id = String(device._id || '');
    if (!id) return [];
    const reports: IReporte[] = [];
    try {
      const filter = JSON.stringify({
        idDispositivo: id,
        $or: [
          { fecha: { $gte: from, $lte: to } },
          { fechaCreacion: { $gte: from, $lte: to } },
        ],
      });
      let page = 0;
      let totalCount: number | undefined;

      do {
        const result = await this.repository.getReportes({
          filter,
          // La primera pagina contiene siempre las lecturas mas nuevas. Esto
          // evita que una historia extensa oculte el estado actual del sensor.
          sort: JSON.stringify({ fecha: -1, fechaCreacion: -1, _id: -1 }),
          limit: REPORT_PAGE_SIZE,
          page,
        });
        const pageRows = result.datos || [];
        reports.push(...pageRows);
        totalCount = Number.isFinite(Number(result.totalCount))
          ? Number(result.totalCount)
          : undefined;
        if (
          !pageRows.length ||
          pageRows.length < REPORT_PAGE_SIZE ||
          (totalCount !== undefined && reports.length >= totalCount)
        ) {
          break;
        }
        page += 1;
      } while (true);

      return this.deduplicateAndSortReports(reports);
    } catch (error) {
      this.logger.warn(
        `No se pudieron leer reportes del sensor ${id}: ${error?.message || error}`,
      );
      return this.deduplicateAndSortReports(reports);
    }
  }

  private deduplicateAndSortReports(reports: IReporte[]): IReporte[] {
    const unique = new Map<string, IReporte>();
    reports.forEach((report) => {
      const id = String(report._id || '');
      const key =
        id ||
        [
          this.validIso(report.fecha) || '',
          this.validIso(report.fechaCreacion) || '',
          String(report.deveui || ''),
          JSON.stringify(report.datos?.valores || {}),
        ].join('|');
      unique.set(key, report);
    });
    return [...unique.values()].sort((a, b) => {
      const left = this.reportTimestamp(a) || '';
      const right = this.reportTimestamp(b) || '';
      return left.localeCompare(right);
    });
  }

  private deviceCouldBelongToLot(
    device: IDispositivo,
    idLote: string,
  ): boolean {
    if (String(device.idLote || '') === idLote) return true;
    return (device.historialAsignacionesLote || []).some(
      (segment) => String(segment.idLote || '') === idLote,
    );
  }

  private isAssignedAt(
    device: IDispositivo,
    idLote: string,
    timestamp: string,
  ): boolean {
    const segments = device.historialAsignacionesLote || [];
    const explicit = segments.filter(
      (segment) => String(segment.idLote || '') === idLote,
    );
    if (explicit.length) {
      return explicit.some((segment) =>
        this.segmentContains(segment, timestamp),
      );
    }
    if (String(device.idLote || '') !== idLote) return false;
    const assignedAt = this.validIso(device.fechaAsignacionLote);
    return !assignedAt || timestamp >= assignedAt;
  }

  private segmentContains(
    segment: IAsignacionDispositivoLote,
    timestamp: string,
  ): boolean {
    const from = this.validIso(segment.fechaDesde);
    const to = this.validIso(segment.fechaHasta);
    return (!from || timestamp >= from) && (!to || timestamp < to);
  }

  private reportTimestamp(report: IReporte): string | undefined {
    return this.validIso(report.fecha) || this.validIso(report.fechaCreacion);
  }

  private finiteOffset(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private averageSensor(
    report: IReporte,
    sensor: 'Temperatura' | 'Humedad',
    offset?: number,
  ): number | undefined {
    const values = (report.datos?.valores?.[sensor] || [])
      .map((item) => item?.valores?.actual ?? item?.valores?.promedio)
      .map(Number)
      .filter(Number.isFinite);
    if (!values.length) return undefined;
    const raw = values.reduce((sum, value) => sum + value, 0) / values.length;
    const result = Number.isFinite(Number(offset)) ? raw + Number(offset) : raw;
    if (sensor === 'Humedad' && (result < 0 || result > 100)) return undefined;
    if (sensor === 'Temperatura' && (result < -60 || result > 65))
      return undefined;
    return result;
  }

  private depthValues(
    report: IReporte,
    sensor: 'Temperatura Suelo' | 'Humedad Suelo Profundidad',
    normalizeMoisture: boolean,
  ): Map<string, number> {
    const result = new Map<string, number>();
    (report.datos?.valores?.[sensor] || []).forEach((item, index) => {
      const raw = Number(item?.valores?.actual ?? item?.valores?.promedio);
      if (!Number.isFinite(raw)) return;
      const value = normalizeMoisture
        ? normalizarContenidoVolumetrico(raw)
        : raw;
      if (!Number.isFinite(value)) return;
      const depth = Number(item.profundidad);
      const key =
        Number.isFinite(depth) && depth > 0
          ? String(depth)
          : String((index + 1) * 10);
      result.set(key, Number(value));
    });
    return result;
  }

  private appendDepthValues(
    target: Map<string, number[]>,
    incoming: Map<string, number>,
  ) {
    for (const [depth, value] of incoming.entries()) {
      target.set(depth, [...(target.get(depth) || []), value]);
    }
  }

  private newBucket(timestamp: string, name: string): IHourlyBucket {
    return {
      timestamp,
      temperatures: [],
      humidities: [],
      soilTemperatures: new Map(),
      soilMoistures: new Map(),
      flags: [],
      sensorNames: new Set([name]),
    };
  }

  private toObservation(
    bucket: IHourlyBucket,
    idEstablecimiento: string,
    timezone: string,
    lote: ILote,
  ): IObservacionMeteorologicaNormalizada | undefined {
    const values: IValoresMeteorologicosNormalizados = {};
    const sources: Partial<
      Record<VariableMeteorologicaNormalizada, FuenteMeteorologicaNormalizada>
    > = {};
    const states: Partial<
      Record<VariableMeteorologicaNormalizada, EstadoDatoMeteorologico>
    > = {};
    const temperature = this.average(bucket.temperatures);
    const humidity = this.average(bucket.humidities);
    const soilTemperature = this.averageDepths(bucket.soilTemperatures);
    const soilMoisture = this.averageDepths(bucket.soilMoistures);

    if (temperature !== undefined) {
      values.temperatureC = temperature;
      sources.temperatureC = 'sensor';
      states.temperatureC = 'observed';
    }
    if (humidity !== undefined) {
      values.relativeHumidityPct = humidity;
      sources.relativeHumidityPct = 'sensor';
      states.relativeHumidityPct = 'observed';
    }
    if (soilTemperature) {
      values.soilTemperatureC = soilTemperature;
      sources.soilTemperatureC = 'sensor';
      states.soilTemperatureC = 'observed';
    }
    if (soilMoisture) {
      values.soilMoistureM3M3 = soilMoisture;
      sources.soilMoistureM3M3 = 'sensor';
      states.soilMoistureM3M3 = 'observed';
    }
    if (!Object.keys(values).length) return undefined;

    return {
      idEstablecimiento,
      timestamp: bucket.timestamp,
      fechaLocal: this.dateInTimezone(bucket.timestamp, timezone),
      timezone,
      granularidad: 'hourly',
      estado: 'observed',
      esPronostico: false,
      valores: values,
      fuente: 'sensor',
      fuentePorVariable: sources,
      estadoPorVariable: states,
      banderasCalidad: [
        'field_sensor',
        ...new Set(
          bucket.flags.filter((flag) => !flag.startsWith('sensor_quality:')),
        ),
        ...(temperature !== undefined
          ? ['temperature_sensor_quality:calificado']
          : []),
        ...(humidity !== undefined
          ? ['humidity_sensor_quality:calificado']
          : []),
        ...[...bucket.sensorNames].map((name) => `sensor:${name}`),
      ],
      completitudPct: this.completeness(values),
      coordenadas: lote.ubicacion?.centro,
      obtenidoEn: new Date().toISOString(),
    };
  }

  private merge(
    base: IObservacionMeteorologicaNormalizada[],
    sensors: IObservacionMeteorologicaNormalizada[],
  ): IObservacionMeteorologicaNormalizada[] {
    const result = new Map(
      base.map((item) => [this.observationKey(item), item]),
    );
    for (const sensor of sensors) {
      const key = this.observationKey(sensor);
      const fallback = result.get(key);
      if (!fallback) {
        result.set(key, sensor);
        continue;
      }
      const values: IValoresMeteorologicosNormalizados = {
        ...fallback.valores,
      };
      const sources: Partial<
        Record<VariableMeteorologicaNormalizada, FuenteMeteorologicaNormalizada>
      > = {};
      const states: Partial<
        Record<VariableMeteorologicaNormalizada, EstadoDatoMeteorologico>
      > = {};
      for (const rawVariable of Object.keys(fallback.valores)) {
        const variable = rawVariable as VariableMeteorologicaNormalizada;
        if (!this.hasValue((fallback.valores as any)[variable])) continue;
        sources[variable] = this.sourceForVariable(fallback, variable);
        states[variable] = this.stateForVariable(fallback, variable);
      }

      for (const rawVariable of Object.keys(sensor.valores)) {
        const variable = rawVariable as VariableMeteorologicaNormalizada;
        const sensorValue = (sensor.valores as any)[variable];
        if (!this.hasValue(sensorValue)) continue;

        if (variable === 'soilTemperatureC') {
          const fallbackHasDepths = this.hasObjectValues(
            fallback.valores.soilTemperatureC,
          );
          values.soilTemperatureC = this.mergeObjects(
            fallback.valores.soilTemperatureC,
            sensor.valores.soilTemperatureC,
          );
          if (fallbackHasDepths) {
            sources[variable] = 'mixed';
            states[variable] = this.conservativeState([
              this.stateForVariable(fallback, variable),
              this.stateForVariable(sensor, variable),
            ]);
            continue;
          }
        } else if (variable === 'soilMoistureM3M3') {
          const fallbackHasDepths = this.hasObjectValues(
            fallback.valores.soilMoistureM3M3,
          );
          values.soilMoistureM3M3 = this.mergeObjects(
            fallback.valores.soilMoistureM3M3,
            sensor.valores.soilMoistureM3M3,
          );
          if (fallbackHasDepths) {
            sources[variable] = 'mixed';
            states[variable] = this.conservativeState([
              this.stateForVariable(fallback, variable),
              this.stateForVariable(sensor, variable),
            ]);
            continue;
          }
        } else {
          (values as any)[variable] = sensorValue;
        }
        sources[variable] = this.sourceForVariable(sensor, variable);
        states[variable] = this.stateForVariable(sensor, variable);
      }

      const canonicalStates = Object.keys(values)
        .map((rawVariable) => {
          const variable = rawVariable as VariableMeteorologicaNormalizada;
          return this.hasValue((values as any)[variable])
            ? states[variable]
            : undefined;
        })
        .filter(
          (state): state is EstadoDatoMeteorologico => state !== undefined,
        );
      const used = new Set(
        Object.values(sources).filter(
          (source): source is FuenteMeteorologicaNormalizada => !!source,
        ),
      );
      const hasSensor = [...used].some(
        (source) => source === 'sensor' || source === 'derived_sensor',
      );
      const hasFallback = [...used].some(
        (source) => source !== 'sensor' && source !== 'derived_sensor',
      );
      const mergedSource: FuenteMeteorologicaNormalizada =
        used.has('mixed') || (hasSensor && hasFallback) || used.size > 1
          ? 'mixed'
          : used.size === 1
            ? [...used][0]
            : fallback.fuente;
      const mergedState = this.conservativeState(canonicalStates);
      result.set(key, {
        ...fallback,
        estado: mergedState,
        esPronostico: canonicalStates.includes('forecast'),
        valores: values,
        fuente: mergedSource,
        fuentePorVariable: sources,
        estadoPorVariable: states,
        banderasCalidad: [
          ...new Set([
            ...fallback.banderasCalidad,
            ...sensor.banderasCalidad,
            ...(hasSensor && hasFallback ? ['sensor_with_fallback'] : []),
          ]),
        ],
        completitudPct: this.completeness(values),
        obtenidoEn: new Date().toISOString(),
      });
    }
    return [...result.values()].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
  }

  private sourceForVariable(
    observation: IObservacionMeteorologicaNormalizada,
    variable: VariableMeteorologicaNormalizada,
  ): FuenteMeteorologicaNormalizada {
    return observation.fuentePorVariable[variable] || observation.fuente;
  }

  private stateForVariable(
    observation: IObservacionMeteorologicaNormalizada,
    variable: VariableMeteorologicaNormalizada,
  ): EstadoDatoMeteorologico {
    return (
      observation.estadoPorVariable?.[variable] ||
      (observation.esPronostico ? 'forecast' : observation.estado)
    );
  }

  private conservativeState(
    states: EstadoDatoMeteorologico[],
  ): EstadoDatoMeteorologico {
    const precedence: EstadoDatoMeteorologico[] = [
      'invalid',
      'missing',
      'forecast',
      'estimated',
      'observed',
    ];
    return precedence.find((state) => states.includes(state)) || 'missing';
  }

  private hasValue(value: unknown): boolean {
    return value !== undefined && value !== null;
  }

  private hasObjectValues(value?: Record<string, number>): boolean {
    return !!value && Object.keys(value).length > 0;
  }

  private calculateHourlyCoverageByDate(
    sensors: IObservacionMeteorologicaNormalizada[],
  ): Map<string, number> {
    const hours = new Map<string, Set<string>>();
    for (const item of sensors) {
      if (!Number.isFinite(item.valores.temperatureC)) continue;
      const set = hours.get(item.fechaLocal) || new Set<string>();
      set.add(item.timestamp.slice(0, 13));
      hours.set(item.fechaLocal, set);
    }
    return new Map(
      [...hours.entries()].map(([date, values]) => [
        date,
        this.round((values.size / 24) * 100, 1),
      ]),
    );
  }

  private observationKey(item: IObservacionMeteorologicaNormalizada): string {
    return `${item.granularidad}|${
      item.granularidad === 'hourly'
        ? this.floorHour(item.timestamp)
        : item.fechaLocal
    }`;
  }

  private floorHour(value: string): string {
    const date = new Date(value);
    date.setUTCMinutes(0, 0, 0);
    return date.toISOString();
  }

  private dateInTimezone(timestamp: string, timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || DEFAULT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(timestamp));
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value || '';
    return `${read('year')}-${read('month')}-${read('day')}`;
  }

  private average(values: number[]): number | undefined {
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : undefined;
  }

  private averageDepths(
    values: Map<string, number[]>,
  ): Record<string, number> | undefined {
    if (!values.size) return undefined;
    return Object.fromEntries(
      [...values.entries()].map(([depth, readings]) => [
        depth,
        this.average(readings),
      ]),
    ) as Record<string, number>;
  }

  private mergeObjects(
    fallback?: Record<string, number>,
    sensor?: Record<string, number>,
  ): Record<string, number> | undefined {
    if (!fallback && !sensor) return undefined;
    return { ...(fallback || {}), ...(sensor || {}) };
  }

  private completeness(values: IValoresMeteorologicosNormalizados): number {
    const required: Array<keyof IValoresMeteorologicosNormalizados> = [
      'temperatureC',
      'relativeHumidityPct',
      'precipitationMm',
      'windSpeedMs',
      'shortwaveRadiationWm2',
    ];
    const available = required.filter(
      (key) => values[key] !== undefined && values[key] !== null,
    ).length;
    return this.round((available / required.length) * 100, 1);
  }

  private validIso(value?: string): string | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  private round(value: number, digits = 2): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
}
