import { Injectable, Logger } from '@nestjs/common';
import {
  calcularCompletitud,
  FuenteMeteorologicaNormalizada,
  IChamanMeteoDaily,
  IChamanMeteoResolvedLocationBinding,
  ICoordenadas,
  IObservacionMeteorologicaNormalizada,
  IValoresMeteorologicosNormalizados,
  validarVariableMeteorologica,
  VariableMeteorologicaNormalizada,
} from 'modelos/src';
import {
  CHAMAN_METEO_AGROMET_BRIDGE_ENABLED,
  CHAMAN_METEO_AGROMET_LOT_ALLOWLIST,
  CHAMAN_METEO_AGROMET_RECENT_OPEN_METEO_DAYS,
  CHAMAN_METEO_AGROMET_SOWING_ALLOWLIST,
  CHAMAN_METEO_CALCULATION_VERSION,
  CHAMAN_METEO_HISTORICAL_START,
  CHAMAN_METEO_SOURCE_VERSION,
} from '../../env';
import { ChamanMeteoRepository } from '../chaman-meteo/repository';

const REQUIRED_DAILY: VariableMeteorologicaNormalizada[] = [
  'temperatureMinC',
  'temperatureMeanC',
  'temperatureMaxC',
  'relativeHumidityMeanPct',
  'precipitationMm',
  'shortwaveRadiationMjM2',
  'et0Mm',
];

const DAILY_SCALARS: ReadonlyArray<
  readonly [
    keyof IChamanMeteoDaily['values'],
    VariableMeteorologicaNormalizada,
    keyof NonNullable<IChamanMeteoDaily['availableHoursByMetric']>,
  ]
> = [
  ['temperatureMinC', 'temperatureMinC', 'temperature'],
  ['temperatureMeanC', 'temperatureMeanC', 'temperature'],
  ['temperatureMaxC', 'temperatureMaxC', 'temperature'],
  ['relativeHumidityMinPct', 'relativeHumidityMinPct', 'relativeHumidity'],
  ['relativeHumidityMeanPct', 'relativeHumidityMeanPct', 'relativeHumidity'],
  ['relativeHumidityMaxPct', 'relativeHumidityMaxPct', 'relativeHumidity'],
  ['dewPointMeanC', 'dewPointC', 'dewPoint'],
  ['precipitationMm', 'precipitationMm', 'precipitation'],
  ['windSpeed2mMeanMs', 'windSpeedMs', 'wind2m'],
  ['windSpeed2mMaxMs', 'windSpeedMaxMs', 'wind2m'],
  ['windDirectionDominantDeg', 'windDirectionDeg', 'windDirection'],
  ['shortwaveRadiationMjM2', 'shortwaveRadiationMjM2', 'shortwaveRadiation'],
  ['vpdMeanKpa', 'vpdMeanKpa', 'vpd'],
  ['vpdMaxKpa', 'vpdMaxKpa', 'vpd'],
  ['et0Mm', 'et0Mm', 'et0'],
];

const SOIL_DEPTHS = ['0-7', '7-28', '28-100', '100-255'] as const;

export interface IChamanMeteoAgrometBridgeConfig {
  enabled: boolean;
  lotAllowlist: string[];
  sowingAllowlist: string[];
  historicalStart: string;
  recentOpenMeteoDays: number;
  calculationVersion: string;
  sourceVersion: string;
}

export interface IChamanMeteoAgrometBridgeInput {
  observations: IObservacionMeteorologicaNormalizada[];
  idEstablecimiento: string;
  idLote?: string;
  idSiembras?: string[];
  coordenadas: ICoordenadas;
  desde: string;
  hasta: string;
  forecast: boolean;
  today?: string;
}

export interface IChamanMeteoAgrometBridgeResult {
  observations: IObservacionMeteorologicaNormalizada[];
  warnings: string[];
  used: boolean;
}

export const DEFAULT_CHAMAN_METEO_AGROMET_BRIDGE_CONFIG: IChamanMeteoAgrometBridgeConfig =
  {
    enabled: CHAMAN_METEO_AGROMET_BRIDGE_ENABLED,
    lotAllowlist: CHAMAN_METEO_AGROMET_LOT_ALLOWLIST,
    sowingAllowlist: CHAMAN_METEO_AGROMET_SOWING_ALLOWLIST,
    historicalStart: CHAMAN_METEO_HISTORICAL_START,
    recentOpenMeteoDays: CHAMAN_METEO_AGROMET_RECENT_OPEN_METEO_DAYS,
    calculationVersion: CHAMAN_METEO_CALCULATION_VERSION,
    sourceVersion: CHAMAN_METEO_SOURCE_VERSION,
  };

export function isChamanMeteoAgrometPilot(
  config: IChamanMeteoAgrometBridgeConfig,
  idLote?: string,
  idSiembras: string[] = [],
): boolean {
  if (!config.enabled) return false;
  const lots = new Set(config.lotAllowlist.map(normalizeIdentifier));
  const sowings = new Set(config.sowingAllowlist.map(normalizeIdentifier));
  if (!lots.size && !sowings.size) return false;
  if (idLote && lots.has(normalizeIdentifier(idLote))) return true;
  return idSiembras.some((id) => sowings.has(normalizeIdentifier(id)));
}

/**
 * Une el fallback por fecha local. Un valor existente nunca se reemplaza;
 * ERA5 completa solamente variables ausentes y cada fecha diaria queda una
 * unica vez.
 */
export function mergeDailyHistoricalGapFill(
  base: IObservacionMeteorologicaNormalizada[],
  fallback: IObservacionMeteorologicaNormalizada[],
): IObservacionMeteorologicaNormalizada[] {
  const nonDaily = base.filter((item) => item.granularidad !== 'daily');
  const daily = new Map<string, IObservacionMeteorologicaNormalizada>();

  base
    .filter((item) => item.granularidad === 'daily')
    .forEach((item) => {
      const existing = daily.get(item.fechaLocal);
      daily.set(
        item.fechaLocal,
        existing ? mergeDuplicateBaseDaily(existing, item) : item,
      );
    });

  fallback
    .filter((item) => item.granularidad === 'daily')
    .forEach((item) => {
      const existing = daily.get(item.fechaLocal);
      daily.set(
        item.fechaLocal,
        existing ? fillMissingDailyValues(existing, item) : item,
      );
    });

  return [...nonDaily, ...daily.values()].sort(
    (left, right) =>
      left.timestamp.localeCompare(right.timestamp) ||
      left.granularidad.localeCompare(right.granularidad),
  );
}

@Injectable()
export class ChamanMeteoAgrometBridgeService {
  private readonly logger = new Logger(ChamanMeteoAgrometBridgeService.name);

  constructor(private readonly repository: ChamanMeteoRepository) {}

  async fillHistoricalDailyGaps(
    input: IChamanMeteoAgrometBridgeInput,
    config: IChamanMeteoAgrometBridgeConfig = DEFAULT_CHAMAN_METEO_AGROMET_BRIDGE_CONFIG,
  ): Promise<IChamanMeteoAgrometBridgeResult> {
    if (
      input.forecast ||
      !input.idLote ||
      !isChamanMeteoAgrometPilot(config, input.idLote, input.idSiembras)
    ) {
      return { observations: input.observations, warnings: [], used: false };
    }

    const today = this.dateOnly(input.today || new Date().toISOString());
    const recentWindowStart = this.addDays(
      today,
      -(Math.max(1, config.recentOpenMeteoDays) - 1),
    );
    const from = [this.dateOnly(input.desde), config.historicalStart]
      .sort()
      .reverse()[0];
    const requestedToExclusive = this.addDays(this.dateOnly(input.hasta), 1);
    const toExclusive = [requestedToExclusive, recentWindowStart].sort()[0];
    if (from >= toExclusive) {
      return { observations: input.observations, warnings: [], used: false };
    }

    try {
      const resolved = await this.repository.resolvedLocationBinding(
        'lote',
        input.idLote,
      );
      const bindingWarning = this.validateResolvedBinding(
        resolved,
        input.idLote,
        input.coordenadas,
      );
      if (bindingWarning || !resolved) {
        return {
          observations: input.observations,
          warnings: [
            bindingWarning ||
              'Chaman-Meteo no encontro un binding activo para el lote piloto.',
          ],
          used: false,
        };
      }

      const page = await this.repository.daily(
        resolved.gridPoint.key,
        500,
        0,
        config.calculationVersion,
        from,
        toExclusive,
      );
      const rows = page?.datos || [];
      const normalized = rows
        .map((row) =>
          this.normalizeDaily(
            row,
            input.idEstablecimiento,
            input.idLote as string,
            resolved,
            config,
          ),
        )
        .filter((item): item is IObservacionMeteorologicaNormalizada =>
          Boolean(item),
        );
      const observations = mergeDailyHistoricalGapFill(
        input.observations,
        normalized,
      );
      const used = observations.some(
        (item) =>
          item.granularidad === 'daily' &&
          item.fechaLocal >= from &&
          item.fechaLocal < toExclusive &&
          Object.values(item.fuentePorVariable || {}).some(
            (source) => source === 'chaman_meteo',
          ),
      );
      const warnings: string[] = [];
      if (!rows.length) {
        warnings.push(
          `Chaman-Meteo no tiene diarios disponibles para ${from}..${toExclusive} en el punto asociado.`,
        );
      } else if (!normalized.length) {
        warnings.push(
          'Chaman-Meteo devolvio dias sin cobertura horaria completa; no se usaron como fallback termico.',
        );
      }
      if (used) {
        warnings.push(
          `Chaman-Meteo completo exclusivamente huecos historicos diarios anteriores a ${recentWindowStart}; Open-Meteo conserva los ultimos ${config.recentOpenMeteoDays} dias y el pronostico.`,
        );
      }
      return { observations, warnings, used };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Fallback Chaman-Meteo omitido para lote ${input.idLote}: ${message}`,
      );
      return {
        observations: input.observations,
        warnings: [
          'Chaman-Meteo no pudo completar el historico del lote piloto; se conservaron sin cambios las fuentes operativas existentes.',
        ],
        used: false,
      };
    }
  }

  private normalizeDaily(
    row: IChamanMeteoDaily,
    idEstablecimiento: string,
    idLote: string,
    resolved: IChamanMeteoResolvedLocationBinding,
    config: IChamanMeteoAgrometBridgeConfig,
  ): IObservacionMeteorologicaNormalizada | undefined {
    const expected = Number(row.hoursExpected);
    const available = Number(row.hoursAvailable);
    const temperatureHours = Number(row.availableHoursByMetric?.temperature);
    if (
      !Number.isFinite(expected) ||
      ![23, 24, 25].includes(expected) ||
      !Number.isFinite(available) ||
      available !== expected ||
      !Number.isFinite(temperatureHours) ||
      temperatureHours !== expected
    ) {
      return undefined;
    }

    const values: IValoresMeteorologicosNormalizados = {};
    const sources: IObservacionMeteorologicaNormalizada['fuentePorVariable'] =
      {};
    const states: NonNullable<
      IObservacionMeteorologicaNormalizada['estadoPorVariable']
    > = {};
    const assign = (target: VariableMeteorologicaNormalizada, raw: unknown) => {
      const value = validarVariableMeteorologica(target, raw);
      if (value === undefined) return;
      (values as any)[target] = value;
      sources[target] = 'chaman_meteo';
      states[target] = 'estimated';
    };
    DAILY_SCALARS.forEach(([source, target, availability]) => {
      if (Number(row.availableHoursByMetric?.[availability]) !== expected) {
        return;
      }
      assign(target, row.values?.[source]);
    });

    const soilTemperature = this.layerMap(
      row.values?.soilTemperatureMeanC,
      'soilTemperatureC',
      row.availableHoursByMetric?.soilTemperature,
      expected,
    );
    const soilMoisture = this.layerMap(
      row.values?.soilWaterMeanM3M3,
      'soilMoistureM3M3',
      row.availableHoursByMetric?.soilWater,
      expected,
    );
    if (soilTemperature) {
      values.soilTemperatureC = soilTemperature;
      sources.soilTemperatureC = 'chaman_meteo';
      states.soilTemperatureC = 'estimated';
    }
    if (soilMoisture) {
      values.soilMoistureM3M3 = soilMoisture;
      sources.soilMoistureM3M3 = 'chaman_meteo';
      states.soilMoistureM3M3 = 'estimated';
    }

    if (
      !['temperatureMinC', 'temperatureMeanC', 'temperatureMaxC'].every((key) =>
        Number.isFinite((values as any)[key]),
      )
    ) {
      return undefined;
    }

    const gridPoint = resolved.gridPoint;
    const flags = [
      ...(row.qualityFlags || []),
      'chaman_meteo_historical_gap_fill',
      'chaman_meteo_grid_binding_verified',
      'chaman_meteo_reanalysis_estimated',
      `chaman_meteo_provider_copernicus_cds`,
      `chaman_meteo_dataset_era5_land_timeseries`,
      `chaman_meteo_calculation_version:${config.calculationVersion}`,
      `chaman_meteo_source_version:${config.sourceVersion}`,
      `chaman_meteo_grid_point:${gridPoint.key}`,
    ];
    return {
      idEstablecimiento,
      idLote,
      timestamp: this.localNoonToUtc(row.date, row.timezone),
      fechaLocal: row.date,
      timezone: row.timezone,
      granularidad: 'daily',
      estado: 'estimated',
      esPronostico: false,
      valores: values,
      fuente: 'chaman_meteo',
      fuentePorVariable: sources,
      estadoPorVariable: states,
      banderasCalidad: [...new Set(flags)],
      completitudPct: calcularCompletitud(values, REQUIRED_DAILY),
      coordenadas: {
        lat: gridPoint.latitude,
        lng: gridPoint.longitude,
      },
      obtenidoEn: row.calculatedAt,
    };
  }

  private validateResolvedBinding(
    resolved: IChamanMeteoResolvedLocationBinding | null,
    idLote: string,
    coordinates: ICoordenadas,
  ): string | undefined {
    if (!resolved) {
      return 'Chaman-Meteo no encontro un binding activo para el lote piloto.';
    }
    if (
      resolved.binding.locationType !== 'lote' ||
      normalizeIdentifier(resolved.binding.locationId) !==
        normalizeIdentifier(idLote) ||
      !resolved.binding.active ||
      !resolved.gridPoint.enabled ||
      resolved.binding.gridPointKey !== resolved.gridPoint.key
    ) {
      return 'El binding Chaman-Meteo no coincide de forma exacta con el lote y el punto activos.';
    }
    const driftKm = this.distanceKm(coordinates, {
      lat: resolved.binding.latitude,
      lng: resolved.binding.longitude,
    });
    if (driftKm > 1) {
      return `El centroide actual del lote difiere ${driftKm.toFixed(2)} km del binding Chaman-Meteo; se requiere revision antes de usarlo.`;
    }
    return undefined;
  }

  private layerMap(
    layers: Array<number | null> | undefined,
    variable: 'soilTemperatureC' | 'soilMoistureM3M3',
    availability: number[] | undefined,
    expected: number,
  ): Record<string, number> | undefined {
    const result: Record<string, number> = {};
    SOIL_DEPTHS.forEach((depth, index) => {
      if (Number(availability?.[index]) !== expected) return;
      const value = validarVariableMeteorologica(variable, layers?.[index]);
      if (value !== undefined) result[depth] = value;
    });
    return Object.keys(result).length ? result : undefined;
  }

  private localNoonToUtc(date: string, timezone: string): string {
    const naiveUtc = new Date(`${date}T12:00:00.000Z`);
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
      let candidate = naiveUtc;
      for (let pass = 0; pass < 2; pass += 1) {
        const parts = formatter.formatToParts(candidate);
        const read = (type: Intl.DateTimeFormatPartTypes) =>
          Number(parts.find((part) => part.type === type)?.value || 0);
        const representedAsUtc = Date.UTC(
          read('year'),
          read('month') - 1,
          read('day'),
          read('hour'),
          read('minute'),
          read('second'),
        );
        candidate = new Date(
          candidate.getTime() + (naiveUtc.getTime() - representedAsUtc),
        );
      }
      return candidate.toISOString();
    } catch {
      return naiveUtc.toISOString();
    }
  }

  private distanceKm(left: ICoordenadas, right: ICoordenadas): number {
    const radians = (value: number) => (value * Math.PI) / 180;
    const lat1 = radians(Number(left.lat));
    const lat2 = radians(Number(right.lat));
    const deltaLat = lat2 - lat1;
    const deltaLon = radians(Number(right.lng) - Number(left.lng));
    const a =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private addDays(value: string, days: number): string {
    const date = new Date(`${this.dateOnly(value)}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private dateOnly(value: string): string {
    return String(value).slice(0, 10);
  }
}

function normalizeIdentifier(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function fillMissingDailyValues(
  primary: IObservacionMeteorologicaNormalizada,
  fallback: IObservacionMeteorologicaNormalizada,
): IObservacionMeteorologicaNormalizada {
  const values = { ...primary.valores };
  const sources = { ...primary.fuentePorVariable };
  const states = { ...(primary.estadoPorVariable || {}) };
  let filled = false;
  for (const key of Object.keys(fallback.valores) as Array<
    keyof IValoresMeteorologicosNormalizados
  >) {
    if (hasWeatherValue(values[key])) continue;
    (values as any)[key] = fallback.valores[key];
    (sources as any)[key] = fallback.fuentePorVariable[key] || fallback.fuente;
    (states as any)[key] = fallback.estadoPorVariable?.[key] || fallback.estado;
    filled = true;
  }
  if (!filled) return primary;
  return {
    ...primary,
    valores: values,
    fuente: primary.fuente === 'chaman_meteo' ? 'chaman_meteo' : 'mixed',
    fuentePorVariable: sources,
    estadoPorVariable: states,
    banderasCalidad: [
      ...new Set([
        ...(primary.banderasCalidad || []),
        ...(fallback.banderasCalidad || []),
      ]),
    ],
    completitudPct: calcularCompletitud(values, REQUIRED_DAILY),
  };
}

function mergeDuplicateBaseDaily(
  left: IObservacionMeteorologicaNormalizada,
  right: IObservacionMeteorologicaNormalizada,
): IObservacionMeteorologicaNormalizada {
  const values = { ...left.valores };
  const sources = { ...left.fuentePorVariable };
  const states = { ...(left.estadoPorVariable || {}) };
  for (const key of Object.keys(right.valores) as Array<
    keyof IValoresMeteorologicosNormalizados
  >) {
    const leftSource = sources[key] || left.fuente;
    const rightSource = right.fuentePorVariable[key] || right.fuente;
    if (
      !hasWeatherValue(values[key]) ||
      sourcePriority(rightSource) > sourcePriority(leftSource)
    ) {
      (values as any)[key] = right.valores[key];
      (sources as any)[key] = rightSource;
      (states as any)[key] = right.estadoPorVariable?.[key] || right.estado;
    }
  }
  const distinctSources = new Set(Object.values(sources).filter(Boolean));
  return {
    ...left,
    valores: values,
    fuente:
      distinctSources.size === 1
        ? ([...distinctSources][0] as FuenteMeteorologicaNormalizada)
        : 'mixed',
    fuentePorVariable: sources,
    estadoPorVariable: states,
    banderasCalidad: [
      ...new Set([
        ...(left.banderasCalidad || []),
        ...(right.banderasCalidad || []),
        'deduplicated_daily_weather_sources',
      ]),
    ],
    completitudPct: calcularCompletitud(values, REQUIRED_DAILY),
  };
}

function sourcePriority(source?: FuenteMeteorologicaNormalizada): number {
  const value = String(source || '');
  if (value.includes('sensor')) return 4;
  if (value.includes('station')) return 3;
  if (value.includes('open_meteo') || value === 'gap_filled') return 2;
  if (value.includes('chaman_meteo')) return 1;
  return value === 'mixed' ? 3 : 0;
}

function hasWeatherValue(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim().length > 0;
  return Boolean(
    value &&
    typeof value === 'object' &&
    Object.values(value as Record<string, unknown>).some(
      (item) => typeof item === 'number' && Number.isFinite(item),
    ),
  );
}
