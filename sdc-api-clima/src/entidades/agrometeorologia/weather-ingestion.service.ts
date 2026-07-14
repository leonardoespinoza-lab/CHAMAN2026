import { Injectable, Logger } from '@nestjs/common';
import {
  ICoordenadas,
  IEstablecimiento,
  IObservacionMeteorologicaNormalizada,
} from 'modelos/src';
import {
  AGROMETEO_CHUNK_DAYS,
  AGROMETEO_FORECAST_DAYS,
  FIELDCLIMATE_MAX_DATA_AGE_HOURS,
} from '../../env';
import { ClimaService } from '../clima/service';
import { AgrometeorologiaRepository } from './repository';
import { WeatherSourceResolverService } from './weather-source-resolver.service';

export interface IWeatherIngestionResult {
  idEstablecimiento: string;
  desde: string;
  hasta: string;
  observaciones: number;
  fuente: 'station' | 'open_meteo' | 'mixed' | 'sin_datos';
  advertencias: string[];
}

@Injectable()
export class WeatherIngestionService {
  private readonly logger = new Logger(WeatherIngestionService.name);

  constructor(
    private clima: ClimaService,
    private repository: AgrometeorologiaRepository,
    private resolver: WeatherSourceResolverService,
  ) {}

  async sincronizar(
    establecimiento: IEstablecimiento,
    coordenadas: ICoordenadas,
    desdeSolicitado: string,
    forceBackfill = false,
  ): Promise<IWeatherIngestionResult> {
    if (!establecimiento?._id) {
      throw new Error('El establecimiento no tiene identificador.');
    }
    const idEstablecimiento = establecimiento._id;
    const advertencias: string[] = [];
    const desde = forceBackfill
      ? this.dateOnly(desdeSolicitado)
      : await this.resolverDesdeIncremental(idEstablecimiento, desdeSolicitado);
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
    );
    total += forecastResult.observaciones;
    forecastResult.fuentes.forEach((source) => fuentes.add(source));
    advertencias.push(...forecastResult.advertencias);

    const fuente =
      fuentes.has('station') && fuentes.has('open_meteo')
        ? 'mixed'
        : fuentes.has('station')
          ? 'station'
          : fuentes.has('open_meteo')
            ? 'open_meteo'
            : 'sin_datos';
    const result: IWeatherIngestionResult = {
      idEstablecimiento,
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
  ): Promise<{
    observaciones: number;
    fuentes: Set<string>;
    advertencias: string[];
  }> {
    const idEstablecimiento = String(establecimiento._id);
    const stationId = establecimiento.idEstacionMeteorologica;
    const fromIso = `${desde}T00:00:00.000Z`;
    const toIso = `${hasta}T23:59:59.999Z`;
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
    const stationHourly = this.resolver.normalizarEstacion(
      stationHourlyResult.datos,
      {
        idEstablecimiento,
        estacionId: stationId,
        estacionNombre: stationName,
        timezone,
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
        timezone,
        granularidad: 'daily',
        coordenadas,
      },
    );
    const stationObservations = [...stationHourly, ...stationDaily];
    const merged = this.resolver.fusionar(
      stationObservations,
      openObservations,
    );
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
          'No se recibieron datos meteorologicos validos para el periodo.',
        ],
      };
    }
    await this.persistirEnLotes(merged, 500);
    const fuentes = new Set<string>();
    merged.forEach((item) => {
      if (item.fuente === 'station') fuentes.add('station');
      if (item.fuente === 'open_meteo') fuentes.add('open_meteo');
      if (item.fuente === 'mixed') {
        fuentes.add('station');
        fuentes.add('open_meteo');
      }
    });
    return {
      observaciones: merged.length,
      fuentes,
      advertencias: [
        ...stationHourlyResult.advertencias,
        ...stationDailyResult.advertencias,
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
  ): Promise<string> {
    const filter = {
      idEstablecimiento,
      granularidad: 'daily',
      esPronostico: false,
    };
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
      const firstDate = first.datos?.[0]?.fechaLocal;
      const lastDate = last.datos?.[0]?.fechaLocal;
      if (!firstDate || !lastDate || requested < firstDate) return requested;
      return [requested, this.addDays(lastDate, -2)].sort().reverse()[0];
    } catch {
      return this.dateOnly(requestedFrom);
    }
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

  private dateOnly(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    return date.toISOString().slice(0, 10);
  }
}
