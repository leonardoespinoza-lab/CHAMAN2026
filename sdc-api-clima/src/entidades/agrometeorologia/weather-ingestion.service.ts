import { Injectable, Logger } from '@nestjs/common';
import {
  ICoordenadas,
  IEstablecimiento,
  IObservacionMeteorologicaNormalizada,
} from 'modelos/src';
import {
  AGROMETEO_CHUNK_DAYS,
  AGROMETEO_FORECAST_DAYS,
  CHAMAN_METEO_AGROMET_BRIDGE_ENABLED,
  FIELDCLIMATE_MAX_DATA_AGE_HOURS,
} from '../../env';
import { ClimaService } from '../clima/service';
import { AgrometeorologiaRepository } from './repository';
import { WeatherSourceResolverService } from './weather-source-resolver.service';
import {
  ChamanMeteoAgrometBridgeService,
  observationForChamanMeteoBridgeState,
} from './chaman-meteo-agromet-bridge.service';

const DEFAULT_OPERATIONAL_TIMEZONE = 'America/Argentina/Buenos_Aires';

export interface IWeatherIngestionResult {
  idEstablecimiento: string;
  idLote?: string;
  desde: string;
  hasta: string;
  observaciones: number;
  fuente: 'station' | 'open_meteo' | 'chaman_meteo' | 'mixed' | 'sin_datos';
  advertencias: string[];
}

@Injectable()
export class WeatherIngestionService {
  private readonly logger = new Logger(WeatherIngestionService.name);

  constructor(
    private clima: ClimaService,
    private repository: AgrometeorologiaRepository,
    private resolver: WeatherSourceResolverService,
    private bridge?: ChamanMeteoAgrometBridgeService,
  ) {}

  async sincronizar(
    establecimiento: IEstablecimiento,
    coordenadas: ICoordenadas,
    desdeSolicitado: string,
    forceBackfill = false,
    idLote?: string,
    idSiembras?: string[],
  ): Promise<IWeatherIngestionResult> {
    if (!establecimiento?._id) {
      throw new Error('El establecimiento no tiene identificador.');
    }
    const idEstablecimiento = establecimiento._id;
    const advertencias: string[] = [];
    const desde = forceBackfill
      ? this.dateOnly(desdeSolicitado)
      : await this.resolverDesdeIncremental(
          idEstablecimiento,
          desdeSolicitado,
          idLote,
        );
    const hoy = this.dateOnly(new Date());
    const ayer = this.addDays(hoy, -1);
    const hastaPronostico = this.addDays(hoy, AGROMETEO_FORECAST_DAYS);
    let total = 0;
    const fuentes = new Set<string>();

    if (desde <= ayer) {
      for (const chunk of this.chunks(desde, ayer, AGROMETEO_CHUNK_DAYS)) {
        const result = await this.ingestarPeriodo(
          establecimiento,
          coordenadas,
          chunk.desde,
          chunk.hasta,
          false,
          idLote,
          idSiembras,
        );
        total += result.observaciones;
        result.fuentes.forEach((source) => fuentes.add(source));
        advertencias.push(...result.advertencias);
      }
    }

    const forecastResult = await this.ingestarPeriodo(
      establecimiento,
      coordenadas,
      hoy,
      hastaPronostico,
      true,
      idLote,
      idSiembras,
    );
    total += forecastResult.observaciones;
    forecastResult.fuentes.forEach((source) => fuentes.add(source));
    advertencias.push(...forecastResult.advertencias);

    const fuente =
      fuentes.size > 1
        ? 'mixed'
        : fuentes.has('station')
          ? 'station'
          : fuentes.has('open_meteo')
            ? 'open_meteo'
            : fuentes.has('chaman_meteo')
              ? 'chaman_meteo'
              : 'sin_datos';
    const result: IWeatherIngestionResult = {
      idEstablecimiento,
      ...(idLote ? { idLote } : {}),
      desde,
      hasta: hastaPronostico,
      observaciones: total,
      fuente,
      advertencias: [...new Set(advertencias)],
    };
    this.logger.log(
      JSON.stringify({ event: 'agromet_weather_sync', ...result }),
    );
    return result;
  }

  private async ingestarPeriodo(
    establecimiento: IEstablecimiento,
    coordenadas: ICoordenadas,
    desde: string,
    hasta: string,
    forecast: boolean,
    idLote?: string,
    idSiembras?: string[],
  ): Promise<{
    observaciones: number;
    fuentes: Set<string>;
    advertencias: string[];
  }> {
    const idEstablecimiento = String(establecimiento._id);
    const stationId = establecimiento.idEstacionMeteorologica;
    const stationRequestTimezone =
      establecimiento.estacionMeteorologica?.position?.timezoneCode ||
      DEFAULT_OPERATIONAL_TIMEZONE;
    const fromIso = this.localDateBoundaryToUtc(desde, stationRequestTimezone);
    const toIso = new Date(
      new Date(
        this.localDateBoundaryToUtc(
          this.addDays(hasta, 1),
          stationRequestTimezone,
        ),
      ).getTime() - 1,
    ).toISOString();
    const [openData, stationHourlyResult, stationDailyResult] =
      await Promise.all([
        this.clima.getOpenMeteoAgrometeorologia(
          coordenadas,
          desde,
          hasta,
          forecast,
        ),
        stationId
          ? this.clima.getDatosEstacionAsociada(
              stationId,
              fromIso,
              toIso,
              'hourly',
            )
          : Promise.resolve({
              estacion: undefined,
              datos: [],
              advertencias: [],
            }),
        stationId
          ? this.clima.getDatosEstacionAsociada(
              stationId,
              fromIso,
              toIso,
              'daily',
            )
          : Promise.resolve({
              estacion: undefined,
              datos: [],
              advertencias: [],
            }),
      ]);

    const timezone = String(
      openData?.timezone || 'America/Argentina/Buenos_Aires',
    );
    const openObservations = this.resolver.normalizarOpenMeteo(
      openData,
      idEstablecimiento,
      coordenadas,
      forecast,
    );
    const stationName =
      stationHourlyResult.estacion?.name?.custom ||
      stationHourlyResult.estacion?.name?.original ||
      stationDailyResult.estacion?.name?.custom ||
      stationDailyResult.estacion?.name?.original;
    const stationTimezone =
      stationHourlyResult.estacion?.position?.timezoneCode ||
      stationDailyResult.estacion?.position?.timezoneCode ||
      stationRequestTimezone ||
      timezone;
    const stationHourly = this.resolver.normalizarEstacion(
      stationHourlyResult.datos,
      {
        idEstablecimiento,
        estacionId: stationId,
        estacionNombre: stationName,
        timezone: stationTimezone,
        granularidad: 'hourly',
        coordenadas,
      },
    );
    const stationDaily = this.resolver.normalizarEstacion(
      stationDailyResult.datos,
      {
        idEstablecimiento,
        estacionId: stationId,
        estacionNombre: stationName,
        timezone: stationTimezone,
        granularidad: 'daily',
        coordenadas,
        coberturaAgregadosDiariosPorFecha:
          this.resolver.calcularCoberturaAgregadosDiariosEstacion(
            stationHourly,
          ),
      },
    );
    const stationObservations = [...stationHourly, ...stationDaily];
    let merged = this.resolver.fusionar(
      stationObservations,
      openObservations,
    );
    const bridgeWarnings: string[] = [];
    if (this.bridge) {
      const bridgeResult = await this.bridge.fillHistoricalDailyGaps({
        observations: merged,
        idEstablecimiento,
        idLote,
        idSiembras,
        coordenadas,
        desde,
        hasta,
        forecast,
      });
      merged = bridgeResult.observations;
      bridgeWarnings.push(...bridgeResult.warnings);
    }
    if (idLote) {
      merged.forEach((item) => {
        item.idLote = idLote;
      });
    }
    const freshnessWarning = this.stationFreshnessWarning(
      stationId,
      stationHourly,
      forecast,
    );
    if (freshnessWarning) {
      merged.forEach((item) => {
        item.banderasCalidad = [
          ...new Set([
            ...item.banderasCalidad,
            'station_stale_open_meteo_fallback',
          ]),
        ];
      });
    }
    if (!merged.length) {
      return {
        observaciones: 0,
        fuentes: new Set(),
        advertencias: [
          ...stationHourlyResult.advertencias,
          ...stationDailyResult.advertencias,
          ...bridgeWarnings,
          'No se recibieron datos meteorologicos validos para el periodo.',
        ],
      };
    }
    await this.persistirEnLotes(merged, 500);
    const fuentes = new Set<string>();
    merged.forEach((item) => {
      const itemSources = [
        item.fuente,
        ...Object.values(item.fuentePorVariable || {}),
      ].map(String);
      if (itemSources.some((source) => source.includes('station'))) {
        fuentes.add('station');
      }
      if (
        itemSources.some(
          (source) => source.includes('open_meteo') || source === 'gap_filled',
        )
      ) {
        fuentes.add('open_meteo');
      }
      if (itemSources.some((source) => source.includes('chaman_meteo'))) {
        fuentes.add('chaman_meteo');
      }
    });
    return {
      observaciones: merged.length,
      fuentes,
      advertencias: [
        ...stationHourlyResult.advertencias,
        ...stationDailyResult.advertencias,
        ...bridgeWarnings,
        ...(freshnessWarning ? [freshnessWarning] : []),
      ],
    };
  }

  private stationFreshnessWarning(
    stationId: string | undefined,
    observations: IObservacionMeteorologicaNormalizada[],
    currentPeriod: boolean,
  ): string | undefined {
    if (!stationId || !currentPeriod) return undefined;
    const latest = observations
      .map((item) => new Date(item.timestamp).getTime())
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];
    const maxAgeMs = FIELDCLIMATE_MAX_DATA_AGE_HOURS * 3600000;
    if (latest && Date.now() - latest <= maxAgeMs) return undefined;
    return `La central asociada no tiene datos horarios validos de las ultimas ${FIELDCLIMATE_MAX_DATA_AGE_HOURS} h; se activo Open-Meteo automaticamente.`;
  }

  private async persistirEnLotes(
    observations: IObservacionMeteorologicaNormalizada[],
    size: number,
  ): Promise<void> {
    for (let index = 0; index < observations.length; index += size) {
      await this.repository.upsertObservaciones(
        observations.slice(index, index + size),
      );
    }
  }

  private async resolverDesdeIncremental(
    idEstablecimiento: string,
    requestedFrom: string,
    idLote?: string,
  ): Promise<string> {
    const filter: Record<string, unknown> = {
      idEstablecimiento,
      granularidad: 'daily',
      esPronostico: false,
    };
    if (idLote) {
      const safeKey = this.safeContextKey(idLote);
      filter.$or = [
        { idLote },
        { [`contextosLote.${safeKey}.idLote`]: idLote },
      ];
    }
    try {
      const [first, last] = await Promise.all([
        this.repository.getObservaciones({
          filter: JSON.stringify(filter),
          sort: 'timestamp',
          limit: 1,
        }),
        this.repository.getObservaciones({
          filter: JSON.stringify(filter),
          sort: '-timestamp',
          limit: 1,
        }),
      ]);
      const requested = this.dateOnly(requestedFrom);
      const firstDate = this.resolveLotContext(
        first.datos?.[0],
        idLote,
      )?.fechaLocal;
      const lastDate = this.resolveLotContext(
        last.datos?.[0],
        idLote,
      )?.fechaLocal;
      if (!firstDate || !lastDate || requested < firstDate) return requested;
      const incrementalStart = [requested, this.addDays(lastDate, -2)]
        .sort()
        .reverse()[0];

      // Una fila existente no prueba que tenga cobertura termica. Antes de
      // continuar incrementalmente se busca el primer dia historico parcial
      // para que Open-Meteo lo repare desde Archive. Nunca se imputa frio/GDD.
      try {
        const coverage = await this.repository.getObservaciones({
          filter: JSON.stringify(filter),
          sort: 'timestamp',
          limit: 5000,
        });
        const firstIncomplete = (coverage?.datos || [])
          .map((item) => this.resolveLotContext(item, idLote))
          .filter(
            (
              item,
            ): item is IObservacionMeteorologicaNormalizada =>
              !!item &&
              item.fechaLocal >= requested &&
              item.fechaLocal <= lastDate,
          )
          .find((item) => !this.hasCompleteDailyTemperature(item));
        if (
          firstIncomplete?.fechaLocal &&
          firstIncomplete.fechaLocal < incrementalStart
        ) {
          return firstIncomplete.fechaLocal;
        }
      } catch (error) {
        this.logger.warn(
          `No se pudo auditar la continuidad termica incremental; se conserva el solapamiento seguro: ${error?.message || error}`,
        );
      }
      return incrementalStart;
    } catch {
      return this.dateOnly(requestedFrom);
    }
  }

  private hasCompleteDailyTemperature(
    observation: IObservacionMeteorologicaNormalizada,
  ): boolean {
    const values = observation.valores || {};
    return [
      values.temperatureMinC,
      values.temperatureMeanC,
      values.temperatureMaxC,
    ].every((value) => typeof value === 'number' && Number.isFinite(value));
  }

  private resolveLotContext(
    observation: IObservacionMeteorologicaNormalizada | undefined,
    idLote?: string,
  ): IObservacionMeteorologicaNormalizada | undefined {
    if (!observation) return undefined;
    if (!idLote) {
      return observationForChamanMeteoBridgeState(
        observation,
        CHAMAN_METEO_AGROMET_BRIDGE_ENABLED,
      );
    }
    const context = observation.contextosLote?.[this.safeContextKey(idLote)];
    if (!context) {
      return observation.idLote === idLote
        ? observationForChamanMeteoBridgeState(
            observation,
            CHAMAN_METEO_AGROMET_BRIDGE_ENABLED,
          )
        : undefined;
    }
    return observationForChamanMeteoBridgeState(
      {
        ...observation,
        ...context,
        valores: {
          ...(observation.valores || {}),
          ...(context.valores || {}),
        },
        fuentePorVariable: {
          ...(observation.fuentePorVariable || {}),
          ...(context.fuentePorVariable || {}),
        },
        estadoPorVariable: {
          ...(observation.estadoPorVariable || {}),
          ...(context.estadoPorVariable || {}),
        },
        contextosLote: observation.contextosLote,
      },
      CHAMAN_METEO_AGROMET_BRIDGE_ENABLED,
    );
  }

  private safeContextKey(value: string): string {
    return String(value).replace(/[.$]/g, '_');
  }

  private chunks(
    from: string,
    to: string,
    days: number,
  ): Array<{ desde: string; hasta: string }> {
    const result: Array<{ desde: string; hasta: string }> = [];
    let cursor = from;
    while (cursor <= to) {
      const end = [this.addDays(cursor, days - 1), to].sort()[0];
      result.push({ desde: cursor, hasta: end });
      cursor = this.addDays(end, 1);
    }
    return result;
  }

  private addDays(value: string, days: number): string {
    const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private localDateBoundaryToUtc(value: string, timezone: string): string {
    const date = value.slice(0, 10);
    const naiveUtc = new Date(`${date}T00:00:00.000Z`);
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
        const offsetMs = representedAsUtc - candidate.getTime();
        candidate = new Date(naiveUtc.getTime() - offsetMs);
      }
      return candidate.toISOString();
    } catch {
      if (timezone !== DEFAULT_OPERATIONAL_TIMEZONE) {
        return this.localDateBoundaryToUtc(date, DEFAULT_OPERATIONAL_TIMEZONE);
      }
      return naiveUtc.toISOString();
    }
  }

  private dateOnly(value: string | Date): string {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.slice(0, 10);
    }
    const date = value instanceof Date ? value : new Date(value);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: DEFAULT_OPERATIONAL_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value || '';
    return `${read('year')}-${read('month')}-${read('day')}`;
  }
}
