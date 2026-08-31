import { Injectable, Logger } from '@nestjs/common';
import {
  calcularCompletitud,
  FuenteMeteorologicaNormalizada,
  IChamanMeteoDaily,
  IChamanMeteoGridPoint,
  IChamanMeteoResolvedLocationBinding,
  ICoordenadas,
  ILote,
  IObservacionMeteorologicaNormalizada,
  IValoresMeteorologicosNormalizados,
  validarVariableMeteorologica,
  VariableMeteorologicaNormalizada,
} from 'modelos/src';
import {
  CHAMAN_METEO_AGROMET_BRIDGE_ENABLED,
  CHAMAN_METEO_AGROMET_AUTO_PROVISION_ENABLED,
  CHAMAN_METEO_AGROMET_AUTO_PROVISION_FROM,
  CHAMAN_METEO_AGROMET_LOT_ALLOWLIST,
  CHAMAN_METEO_AGROMET_RECENT_OPEN_METEO_DAYS,
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

const DAILY_TEMPERATURE_KEYS = [
  'temperatureMinC',
  'temperatureMeanC',
  'temperatureMaxC',
] as const;

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

const MAX_LOT_BINDING_DRIFT_KM = 1;
const MAX_GRID_BINDING_DISTANCE_KM = 15;
const BINDING_DISTANCE_TOLERANCE_KM = 0.1;

export interface IChamanMeteoAgrometBridgeConfig {
  enabled: boolean;
  autoProvisionEnabled: boolean;
  autoProvisionFrom?: string;
  lotAllowlist: string[];
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
  coverageStart?: string;
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
    autoProvisionEnabled: CHAMAN_METEO_AGROMET_AUTO_PROVISION_ENABLED,
    autoProvisionFrom: CHAMAN_METEO_AGROMET_AUTO_PROVISION_FROM,
    lotAllowlist: CHAMAN_METEO_AGROMET_LOT_ALLOWLIST,
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
  if (!config.enabled || !idLote) return false;
  const sowings = new Set(idSiembras.map(normalizeIdentifier).filter(Boolean));
  if (config.autoProvisionEnabled) return sowings.size > 0;
  const lots = new Set(config.lotAllowlist.map(normalizeIdentifier));
  return lots.has(normalizeIdentifier(idLote)) && sowings.size === 1;
}

export function isChamanMeteoAutoProvisionEligible(
  config: IChamanMeteoAgrometBridgeConfig,
  idLote: string,
  coverageStart?: string,
): boolean {
  if (!config.autoProvisionEnabled) return false;
  const explicitlyAllowed = new Set(
    config.lotAllowlist.map(normalizeIdentifier).filter(Boolean),
  ).has(normalizeIdentifier(idLote));
  if (explicitlyAllowed) return true;
  return Boolean(
    config.autoProvisionFrom &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(coverageStart || '')) &&
      String(coverageStart) >= config.autoProvisionFrom,
  );
}

export function chamanMeteoCountryFromTimezone(
  timezone?: string,
): IChamanMeteoGridPoint['countryCode'] | undefined {
  const normalized = String(timezone || '').trim();
  if (
    normalized.startsWith('America/Argentina/') ||
    normalized === 'America/Buenos_Aires'
  ) {
    return 'AR';
  }
  if (normalized === 'America/Montevideo') return 'UY';
  if (normalized === 'America/Asuncion') return 'PY';
  if (
    normalized === 'America/Santiago' ||
    normalized === 'America/Punta_Arenas'
  ) {
    return 'CL';
  }
  const brazilTimezones = new Set([
    'America/Araguaina',
    'America/Bahia',
    'America/Belem',
    'America/Boa_Vista',
    'America/Campo_Grande',
    'America/Cuiaba',
    'America/Eirunepe',
    'America/Fortaleza',
    'America/Maceio',
    'America/Manaus',
    'America/Noronha',
    'America/Porto_Velho',
    'America/Recife',
    'America/Rio_Branco',
    'America/Santarem',
    'America/Sao_Paulo',
  ]);
  return brazilTimezones.has(normalized) ? 'BR' : undefined;
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
    if (!input.idLote || !config.enabled) {
      return { observations: input.observations, warnings: [], used: false };
    }
    if (!isChamanMeteoAgrometPilot(config, input.idLote, input.idSiembras)) {
      return {
        observations: input.observations,
        warnings: [
          config.autoProvisionEnabled
            ? 'Chaman-Meteo omitio el lote: el contexto no identifica siembras activas explicitas.'
            : 'Chaman-Meteo omitio el lote piloto: debe estar autorizado y contener exactamente una siembra activa explicita.',
        ],
        used: false,
      };
    }
    const coverageStart = this.dateOnly(input.coverageStart || input.desde);
    if (
      config.autoProvisionEnabled &&
      !isChamanMeteoAutoProvisionEligible(
        config,
        input.idLote,
        coverageStart,
      )
    ) {
      return {
        observations: input.observations,
        warnings: [],
        used: false,
      };
    }

    try {
      const activeSowingWarning = await this.validateActiveSowingSet(
        input.idLote,
        input.idSiembras || [],
        !config.autoProvisionEnabled,
      );
      if (activeSowingWarning) {
        return {
          observations: input.observations,
          warnings: [activeSowingWarning],
          used: false,
        };
      }

      const bindingResolution = await this.ensureLotBinding(
        input,
        config,
      );
      const resolved = bindingResolution.resolved;
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
              bindingResolution.warning ||
              'Chaman-Meteo no encontro un binding activo para el lote.',
          ],
          used: false,
        };
      }

      if (input.forecast) {
        return {
          observations: input.observations,
          warnings: bindingResolution.provisioned
            ? [
                `Chaman-Meteo vinculo el lote al punto ${resolved.gridPoint.key}; el worker completara el historico desde ${resolved.gridPoint.historicalStart}.`,
              ]
            : [],
          used: false,
        };
      }

      const requestedFrom = this.dateOnly(input.desde);
      const requestedTo = this.dateOnly(input.hasta);
      const today = input.today
        ? this.dateOnly(input.today)
        : this.localDateInTimezone(
            new Date(),
            resolved.gridPoint.timezone as string,
          );
      if (
        !today ||
        !this.isCalendarDate(today) ||
        !this.isCalendarDate(requestedFrom) ||
        !this.isCalendarDate(requestedTo) ||
        !this.isCalendarDate(config.historicalStart)
      ) {
        return {
          observations: input.observations,
          warnings: [
            'Chaman-Meteo bloqueo el relleno: el rango o la fecha local del punto no es valida.',
          ],
          used: false,
        };
      }
      const recentWindowStart = this.addDays(
        today,
        -(Math.max(1, config.recentOpenMeteoDays) - 1),
      );
      const from = [
        requestedFrom,
        config.historicalStart,
        resolved.gridPoint.historicalStart,
      ]
        .sort()
        .reverse()[0];
      const requestedToExclusive = this.addDays(requestedTo, 1);
      const toExclusive = [requestedToExclusive, recentWindowStart].sort()[0];
      if (from >= toExclusive) {
        return { observations: input.observations, warnings: [], used: false };
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
      const duplicateDates = this.duplicateDailyDates(rows);
      if (duplicateDates.length) {
        return {
          observations: input.observations,
          warnings: [
            `Chaman-Meteo bloqueo el relleno: weather_daily devolvio fechas duplicadas (${duplicateDates.join(', ')}).`,
          ],
          used: false,
        };
      }
      if (Number(page?.total) !== rows.length) {
        return {
          observations: input.observations,
          warnings: [
            'Chaman-Meteo bloqueo el relleno: la pagina diaria no representa la totalidad del rango solicitado.',
          ],
          used: false,
        };
      }
      if (rows.some((row) => row.date < from || row.date >= toExclusive)) {
        return {
          observations: input.observations,
          warnings: [
            'Chaman-Meteo bloqueo el relleno: weather_daily devolvio fechas fuera del rango solicitado.',
          ],
          used: false,
        };
      }
      if (
        rows.some(
          (row) =>
            row.gridPointKey !== resolved.gridPoint.key ||
            row.calculationVersion !== config.calculationVersion ||
            row.timezone !== resolved.gridPoint.timezone,
        )
      ) {
        return {
          observations: input.observations,
          warnings: [
            'Chaman-Meteo bloqueo el relleno: un diario no coincide con la grilla, version o zona horaria del binding.',
          ],
          used: false,
        };
      }

      // La llamada interactiva conoce una sola siembra, pero eso no prueba que
      // sea la unica activa del lote. Se vuelve a consultar al servidor justo
      // antes de aplicar ERA5 para evitar un cambio concurrente entre lectura y
      // mezcla (TOCTOU).
      const activeSowingRevalidationWarning =
        await this.validateActiveSowingSet(
          input.idLote,
          input.idSiembras || [],
          !config.autoProvisionEnabled,
        );
      if (activeSowingRevalidationWarning) {
        return {
          observations: input.observations,
          warnings: [activeSowingRevalidationWarning],
          used: false,
        };
      }

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
      } else if (normalized.length !== rows.length) {
        warnings.push(
          `Chaman-Meteo descarto ${rows.length - normalized.length} dia(s) por metadatos, zona horaria o cobertura invalidos.`,
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
          'Chaman-Meteo no pudo completar el historico del lote; se conservaron sin cambios las fuentes operativas existentes.',
        ],
        used: false,
      };
    }
  }

  private async validateActiveSowingSet(
    idLote: string,
    requestedSowingIds: string[],
    requireSingle: boolean,
  ): Promise<string | undefined> {
    const requested = [
      ...new Set(requestedSowingIds.map(normalizeIdentifier).filter(Boolean)),
    ].sort();
    if (!requested.length || (requireSingle && requested.length !== 1)) {
      return requireSingle
        ? 'Chaman-Meteo bloqueo el lote piloto: la solicitud debe identificar exactamente una siembra activa.'
        : 'Chaman-Meteo bloqueo el lote: la solicitud no identifica siembras activas.';
    }

    const page = await this.repository.activeSowingsByLot(idLote);
    const rows = Array.isArray(page?.datos) ? page.datos : [];
    if (
      !page ||
      !Number.isFinite(Number(page.totalCount)) ||
      Number(page.totalCount) !== rows.length
    ) {
      return 'Chaman-Meteo bloqueo el lote: la consulta server-side de siembras activas fue incompleta.';
    }

    if (requireSingle && rows.length !== 1) {
      return `Chaman-Meteo bloqueo el lote piloto: el servidor de datos informo ${rows.length} siembras activas; se exige exactamente una.`;
    }
    const actual = rows
      .map((item) => ({
        id: normalizeIdentifier(item?._id),
        idLote: normalizeIdentifier(item?.idLote),
        active: item?.activa !== false,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
    if (
      actual.some(
        (item) =>
          !item.id ||
          item.idLote !== normalizeIdentifier(idLote) ||
          !item.active,
      )
    ) {
      return 'Chaman-Meteo bloqueo el lote: una siembra activa devuelta por el servidor no pertenece de forma valida al lote.';
    }
    const actualIds = actual.map((item) => item.id);
    if (
      actualIds.length !== requested.length ||
      actualIds.some((id, index) => id !== requested[index])
    ) {
      return requireSingle
        ? 'Chaman-Meteo bloqueo el lote piloto: la siembra solicitada no coincide con la unica siembra activa real del lote.'
        : 'Chaman-Meteo bloqueo el lote: el conjunto solicitado no coincide exactamente con todas las siembras activas reales.';
    }
    return undefined;
  }

  private async ensureLotBinding(
    input: IChamanMeteoAgrometBridgeInput,
    config: IChamanMeteoAgrometBridgeConfig,
  ): Promise<{
    resolved: IChamanMeteoResolvedLocationBinding | null;
    provisioned: boolean;
    warning?: string;
  }> {
    const idLote = String(input.idLote || '');
    let resolved = await this.repository.resolvedLocationBinding(
      'lote',
      idLote,
    );
    if (!config.autoProvisionEnabled) {
      return { resolved, provisioned: false };
    }

    const coverageStart = this.dateOnly(input.coverageStart || input.desde);
    if (!this.isCalendarDate(coverageStart)) {
      return {
        resolved,
        provisioned: false,
        warning:
          'Chaman-Meteo no pudo vincular el lote: la fecha inicial de cobertura no es valida.',
      };
    }
    const historicalStart = [coverageStart, config.historicalStart]
      .sort()
      .reverse()[0];

    if (resolved) {
      if (resolved.gridPoint.historicalStart > historicalStart) {
        await this.repository.upsertGridPoint({
          ...resolved.gridPoint,
          historicalStart,
        });
        resolved = await this.repository.resolvedLocationBinding(
          'lote',
          idLote,
        );
      }
      return { resolved, provisioned: false };
    }

    const lot = await this.repository.lot(idLote);
    const timezone = this.resolveProvisioningTimezone(
      input.observations,
      lot,
    );
    const countryCode =
      this.resolveCountryCode(lot) || chamanMeteoCountryFromTimezone(timezone);
    if (!countryCode || !timezone) {
      return {
        resolved: null,
        provisioned: false,
        warning:
          'Chaman-Meteo dejo la vinculacion pendiente: el lote necesita pais oficial y zona horaria IANA resuelta por Open-Meteo o su central.',
      };
    }

    const gridCoordinates = this.snapEra5Grid(input.coordenadas);
    const gridPoint: IChamanMeteoGridPoint = {
      key: this.gridPointKey(countryCode, gridCoordinates, timezone),
      latitude: gridCoordinates.lat,
      longitude: gridCoordinates.lng,
      countryCode,
      timezone,
      enabled: true,
      provider: 'copernicus-cds',
      dataset: 'reanalysis-era5-land-timeseries',
      historicalStart,
    };
    const distanceKm = this.distanceKm(input.coordenadas, gridCoordinates);
    if (distanceKm > MAX_GRID_BINDING_DISTANCE_KM) {
      return {
        resolved: null,
        provisioned: false,
        warning:
          'Chaman-Meteo no pudo vincular el lote: la grilla calculada excede la distancia maxima permitida.',
      };
    }

    await this.repository.upsertGridPoint(gridPoint);
    await this.repository.upsertLocationBinding({
      locationType: 'lote',
      locationId: idLote,
      gridPointKey: gridPoint.key,
      latitude: Number(input.coordenadas.lat),
      longitude: Number(input.coordenadas.lng),
      distanceKm: +distanceKm.toFixed(6),
      active: true,
    });
    resolved = await this.repository.resolvedLocationBinding('lote', idLote);
    return { resolved, provisioned: Boolean(resolved) };
  }

  private resolveCountryCode(
    lot: ILote,
  ): IChamanMeteoGridPoint['countryCode'] | undefined {
    const official = lot?.ubicacionAdministrativa?.pais;
    const establishmentOfficial = lot?.establecimiento?.ubicacionOficial?.pais;
    const candidates = [
      official?.id,
      official?.nombre,
      official?.nombreCompleto,
      establishmentOfficial?.id,
      establishmentOfficial?.nombre,
      establishmentOfficial?.nombreCompleto,
    ]
      .map(normalizeCountry)
      .filter(Boolean);
    const aliases: Array<
      readonly [IChamanMeteoGridPoint['countryCode'], string[]]
    > = [
      ['AR', ['ar', 'arg', 'argentina']],
      ['UY', ['uy', 'ury', 'uruguay']],
      ['PY', ['py', 'pry', 'paraguay']],
      ['BR', ['br', 'bra', 'brasil', 'brazil']],
      ['CL', ['cl', 'chl', 'chile']],
    ];
    return aliases.find(([, values]) =>
      candidates.some((candidate) => values.includes(candidate)),
    )?.[0];
  }

  private resolveProvisioningTimezone(
    observations: IObservacionMeteorologicaNormalizada[],
    lot: ILote,
  ): string | undefined {
    const candidates = [
      ...(observations || []).map((item) => item.timezone),
      lot?.establecimiento?.estacionMeteorologica?.position?.timezoneCode,
    ]
      .map((item) => String(item || '').trim())
      .filter((item) => item.startsWith('America/'));
    return candidates.find((item) => this.isIanaTimezone(item));
  }

  private snapEra5Grid(coordinates: ICoordenadas): ICoordenadas {
    const snap = (value: number) => {
      const rounded = Math.round(Number(value) * 10) / 10;
      return Object.is(rounded, -0) ? 0 : rounded;
    };
    return { lat: snap(coordinates.lat), lng: snap(coordinates.lng) };
  }

  private gridPointKey(
    countryCode: IChamanMeteoGridPoint['countryCode'],
    coordinates: ICoordenadas,
    timezone: string,
  ): string {
    const coordinate = (value: number) => Number(value).toFixed(1);
    const timezoneKey = timezone.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `era5-land:${String(countryCode).toLowerCase()}:${coordinate(coordinates.lat)}:${coordinate(coordinates.lng)}:${timezoneKey}`;
  }

  private normalizeDaily(
    row: IChamanMeteoDaily,
    idEstablecimiento: string,
    idLote: string,
    resolved: IChamanMeteoResolvedLocationBinding,
    config: IChamanMeteoAgrometBridgeConfig,
  ): IObservacionMeteorologicaNormalizada | undefined {
    const gridPoint = resolved.gridPoint;
    if (
      row.gridPointKey !== gridPoint.key ||
      row.calculationVersion !== config.calculationVersion ||
      !this.isCalendarDate(row.date) ||
      row.date < config.historicalStart ||
      row.timezone !== gridPoint.timezone ||
      !this.isIanaTimezone(row.timezone) ||
      !Number.isFinite(new Date(row.calculatedAt).getTime())
    ) {
      return undefined;
    }
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

    if (
      !DAILY_TEMPERATURE_KEYS.every((key) =>
        Number.isFinite((values as any)[key]),
      )
    ) {
      return undefined;
    }
    if (!hasCoherentDailyTemperature(values)) return undefined;

    const timestamp = this.localNoonToUtc(row.date, row.timezone);
    if (!timestamp) return undefined;
    const flags = [
      ...(row.qualityFlags || []),
      'chaman_meteo_historical_gap_fill',
      'chaman_meteo_grid_binding_verified',
      'chaman_meteo_reanalysis_estimated',
      'chaman_meteo_daily_uniqueness_verified',
      'chaman_meteo_atmospheric_only_v1',
      `chaman_meteo_provider_copernicus_cds`,
      `chaman_meteo_dataset_era5_land_timeseries`,
      `chaman_meteo_calculation_version:${config.calculationVersion}`,
      `chaman_meteo_source_version:${config.sourceVersion}`,
      `chaman_meteo_grid_point:${gridPoint.key}`,
    ];
    return {
      idEstablecimiento,
      idLote,
      timestamp,
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
    const bindingCoordinates = {
      lat: Number(resolved.binding.latitude),
      lng: Number(resolved.binding.longitude),
    };
    const gridCoordinates = {
      lat: Number(resolved.gridPoint.latitude),
      lng: Number(resolved.gridPoint.longitude),
    };
    if (
      !this.validCoordinates(coordinates) ||
      !this.validCoordinates(bindingCoordinates) ||
      !this.validCoordinates(gridCoordinates)
    ) {
      return 'El binding Chaman-Meteo contiene coordenadas invalidas.';
    }
    if (
      resolved.gridPoint.provider !== 'copernicus-cds' ||
      resolved.gridPoint.dataset !== 'reanalysis-era5-land-timeseries' ||
      !['AR', 'UY', 'PY', 'BR', 'CL'].includes(
        String(resolved.gridPoint.countryCode || ''),
      ) ||
      !this.isCalendarDate(resolved.gridPoint.historicalStart || '') ||
      !this.isIanaTimezone(resolved.gridPoint.timezone || '')
    ) {
      return 'El punto Chaman-Meteo no coincide con el proveedor, dataset o timezone operativo esperado.';
    }
    const driftKm = this.distanceKm(coordinates, {
      lat: bindingCoordinates.lat,
      lng: bindingCoordinates.lng,
    });
    if (driftKm > MAX_LOT_BINDING_DRIFT_KM) {
      return `El centroide actual del lote difiere ${driftKm.toFixed(2)} km del binding Chaman-Meteo; se requiere revision antes de usarlo.`;
    }
    const calculatedDistanceKm = this.distanceKm(
      bindingCoordinates,
      gridCoordinates,
    );
    const declaredDistanceKm = Number(resolved.binding.distanceKm);
    if (
      !Number.isFinite(declaredDistanceKm) ||
      declaredDistanceKm < 0 ||
      declaredDistanceKm > MAX_GRID_BINDING_DISTANCE_KM ||
      calculatedDistanceKm > MAX_GRID_BINDING_DISTANCE_KM ||
      Math.abs(calculatedDistanceKm - declaredDistanceKm) >
        BINDING_DISTANCE_TOLERANCE_KM
    ) {
      return 'La distancia declarada entre el binding y la grilla Chaman-Meteo no es valida o no coincide con sus coordenadas.';
    }
    return undefined;
  }

  private localNoonToUtc(date: string, timezone: string): string | undefined {
    if (!this.isCalendarDate(date) || !this.isIanaTimezone(timezone)) {
      return undefined;
    }
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
      if (this.localDateInTimezone(candidate, timezone) !== date) {
        return undefined;
      }
      return candidate.toISOString();
    } catch {
      return undefined;
    }
  }

  private localDateInTimezone(
    date: Date,
    timezone: string,
  ): string | undefined {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(date);
      const read = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value;
      const year = read('year');
      const month = read('month');
      const day = read('day');
      return year && month && day ? `${year}-${month}-${day}` : undefined;
    } catch {
      return undefined;
    }
  }

  private isIanaTimezone(value: string): boolean {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
      return Boolean(value);
    } catch {
      return false;
    }
  }

  private isCalendarDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }

  private validCoordinates(value: ICoordenadas): boolean {
    const lat = Number(value?.lat);
    const lng = Number(value?.lng);
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  }

  private duplicateDailyDates(rows: IChamanMeteoDaily[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    rows.forEach((row) => {
      const date = String(row?.date || '');
      if (seen.has(date)) duplicates.add(date || 'sin-fecha');
      seen.add(date);
    });
    return [...duplicates].sort();
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

function normalizeCountry(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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
  const flags = [...(primary.banderasCalidad || [])];
  let filled = false;
  if (deriveMissingDailyTemperatureMean(values, sources, states, flags)) {
    filled = true;
  }
  const fallbackTemperatureKeys = new Set<
    (typeof DAILY_TEMPERATURE_KEYS)[number]
  >();
  for (const key of Object.keys(fallback.valores) as Array<
    keyof IValoresMeteorologicosNormalizados
  >) {
    if (hasWeatherValue(values[key])) continue;
    (values as any)[key] = fallback.valores[key];
    (sources as any)[key] = fallback.fuentePorVariable[key] || fallback.fuente;
    (states as any)[key] = fallback.estadoPorVariable?.[key] || fallback.estado;
    if ((DAILY_TEMPERATURE_KEYS as readonly string[]).includes(key)) {
      fallbackTemperatureKeys.add(
        key as (typeof DAILY_TEMPERATURE_KEYS)[number],
      );
    }
    filled = true;
  }
  if (
    DAILY_TEMPERATURE_KEYS.every((key) => hasWeatherValue(values[key])) &&
    !hasCoherentDailyTemperature(values)
  ) {
    fallbackTemperatureKeys.forEach((key) => {
      delete (values as any)[key];
      delete (sources as any)[key];
      delete (states as any)[key];
    });
    flags.push('historical_fallback_temperature_triplet_incoherent');
  }
  if (!filled) return primary;
  const distinctSources = new Set(
    Object.keys(values)
      .map((key) => (sources as any)[key])
      .filter(Boolean),
  );
  return {
    ...primary,
    valores: values,
    fuente:
      distinctSources.size === 1
        ? ([...distinctSources][0] as FuenteMeteorologicaNormalizada)
        : 'mixed',
    fuentePorVariable: sources,
    estadoPorVariable: states,
    banderasCalidad: [
      ...new Set([...flags, ...(fallback.banderasCalidad || [])]),
    ],
    completitudPct: calcularCompletitud(values, REQUIRED_DAILY),
  };
}

function deriveMissingDailyTemperatureMean(
  values: IValoresMeteorologicosNormalizados,
  sources: IObservacionMeteorologicaNormalizada['fuentePorVariable'],
  states: NonNullable<
    IObservacionMeteorologicaNormalizada['estadoPorVariable']
  >,
  flags: string[],
): boolean {
  if (hasWeatherValue(values.temperatureMeanC)) return false;
  const min = Number(values.temperatureMinC);
  const max = Number(values.temperatureMaxC);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const minSource = sources.temperatureMinC;
  const maxSource = sources.temperatureMaxC;
  const derivedSource = commonDerivedTemperatureSource(minSource, maxSource);
  if (!derivedSource) return false;
  values.temperatureMeanC = (min + max) / 2;
  sources.temperatureMeanC = derivedSource;
  states.temperatureMeanC =
    states.temperatureMinC === 'forecast' ||
    states.temperatureMaxC === 'forecast'
      ? 'forecast'
      : 'estimated';
  flags.push('temperature_mean_derived_from_daily_min_max');
  return true;
}

function commonDerivedTemperatureSource(
  left?: FuenteMeteorologicaNormalizada,
  right?: FuenteMeteorologicaNormalizada,
): FuenteMeteorologicaNormalizada | undefined {
  const family = (source?: FuenteMeteorologicaNormalizada) => {
    const value = String(source || '');
    if (value.includes('sensor')) return 'sensor';
    if (value.includes('station')) return 'station';
    if (value.includes('open_meteo') || value === 'gap_filled') {
      return 'open_meteo';
    }
    if (value.includes('chaman_meteo')) return 'chaman_meteo';
    return undefined;
  };
  const leftFamily = family(left);
  if (!leftFamily || leftFamily !== family(right)) return undefined;
  return `derived_${leftFamily}` as FuenteMeteorologicaNormalizada;
}

function hasCoherentDailyTemperature(
  values: IValoresMeteorologicosNormalizados,
): boolean {
  const min = Number(values.temperatureMinC);
  const mean = Number(values.temperatureMeanC);
  const max = Number(values.temperatureMaxC);
  return (
    Number.isFinite(min) &&
    Number.isFinite(mean) &&
    Number.isFinite(max) &&
    min <= mean &&
    mean <= max
  );
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

export function isChamanMeteoSource(source: unknown): boolean {
  return String(source || '').includes('chaman_meteo');
}

export function recordUsesChamanMeteo(record: {
  fuente?: unknown;
  fuentePorVariable?: Record<string, unknown>;
  banderasCalidad?: string[];
}): boolean {
  return (
    isChamanMeteoSource(record?.fuente) ||
    Object.values(record?.fuentePorVariable || {}).some(isChamanMeteoSource) ||
    (record?.banderasCalidad || []).some(
      (flag) =>
        String(flag).startsWith('chaman_meteo_') &&
        flag !== 'chaman_meteo_disabled_source_removed',
    )
  );
}

/**
 * Kill switch reversible: los documentos permanecen auditables en Mongo, pero
 * al apagar el puente se retiran todas las variables cuya procedencia sea
 * Chaman-Meteo antes de cualquier calculo o respuesta. Si una fila antigua no
 * permite separar la procedencia con seguridad, se descarta completa.
 */
export function observationForChamanMeteoBridgeState(
  observation: IObservacionMeteorologicaNormalizada,
  enabled: boolean,
): IObservacionMeteorologicaNormalizada | undefined {
  if (enabled || !recordUsesChamanMeteo(observation)) return observation;

  const values = { ...(observation.valores || {}) };
  const sources = { ...(observation.fuentePorVariable || {}) };
  const states = { ...(observation.estadoPorVariable || {}) };
  const originalValueKeys = Object.keys(values).filter((key) =>
    hasWeatherValue((values as any)[key]),
  );
  let removed = 0;
  for (const key of originalValueKeys) {
    const variableSource = (sources as any)[key];
    const source =
      variableSource ||
      (isChamanMeteoSource(observation.fuente)
        ? observation.fuente
        : undefined);
    if (!isChamanMeteoSource(source)) continue;
    delete (values as any)[key];
    delete (sources as any)[key];
    delete (states as any)[key];
    removed += 1;
  }

  // Un registro marcado como ERA5 pero sin procedencia por variable no puede
  // separarse de manera segura. Fallar cerrado evita conservar un valor opaco.
  if (!removed && recordUsesChamanMeteo(observation)) return undefined;
  const remainingValueKeys = Object.keys(values).filter((key) =>
    hasWeatherValue((values as any)[key]),
  );
  if (!remainingValueKeys.length) return undefined;
  if (remainingValueKeys.some((key) => !(sources as any)[key])) {
    return undefined;
  }

  const remainingSources = new Set(
    remainingValueKeys
      .map((key) => (sources as any)[key])
      .filter((source): source is FuenteMeteorologicaNormalizada =>
        Boolean(source),
      ),
  );
  if ([...remainingSources].some(isChamanMeteoSource)) return undefined;
  const fuente =
    remainingSources.size === 1
      ? [...remainingSources][0]
      : remainingSources.size > 1
        ? 'mixed'
        : observation.fuente;
  if (isChamanMeteoSource(fuente)) return undefined;
  const ratio = originalValueKeys.length
    ? remainingValueKeys.length / originalValueKeys.length
    : 0;
  return {
    ...observation,
    valores: values,
    fuente,
    fuentePorVariable: sources,
    estadoPorVariable: states,
    completitudPct:
      Math.round(Math.min(observation.completitudPct, 100 * ratio) * 10) / 10,
    banderasCalidad: [
      ...new Set([
        ...(observation.banderasCalidad || []).map((flag) =>
          flag.startsWith('chaman_meteo_') ? `excluded_${flag}` : flag,
        ),
        'chaman_meteo_disabled_source_removed',
      ]),
    ],
  };
}
