import { Injectable } from '@nestjs/common';
import {
  calcularCompletitud,
  calcularPuntoRocioC,
  calcularVpdKpa,
  EstadoDatoMeteorologico,
  FuenteMeteorologicaNormalizada,
  IClimaEstacionMeteorologica,
  ICoordenadas,
  IObservacionMeteorologicaNormalizada,
  IValoresMeteorologicosNormalizados,
  validarVariableMeteorologica,
  VariableMeteorologicaNormalizada,
} from 'modelos/src';

const REQUIRED_HOURLY: VariableMeteorologicaNormalizada[] = [
  'temperatureC',
  'relativeHumidityPct',
  'precipitationMm',
  'windSpeedMs',
  'shortwaveRadiationWm2',
  'vpdKpa',
  'et0Mm',
];

const REQUIRED_DAILY: VariableMeteorologicaNormalizada[] = [
  'temperatureMinC',
  'temperatureMeanC',
  'temperatureMaxC',
  'relativeHumidityMeanPct',
  'precipitationMm',
  'shortwaveRadiationMjM2',
  'et0Mm',
];

@Injectable()
export class WeatherSourceResolverService {
  normalizarOpenMeteo(
    data: any,
    idEstablecimiento: string,
    coordenadas: ICoordenadas,
    forecast: boolean,
  ): IObservacionMeteorologicaNormalizada[] {
    if (!data || typeof data !== 'object') return [];
    const timezone = String(data.timezone || 'UTC');
    const utcOffsetSeconds = Number(data.utc_offset_seconds || 0);
    const obtenidoEn = new Date().toISOString();
    const hourly = this.normalizarOpenMeteoHorario(
      data,
      idEstablecimiento,
      coordenadas,
      forecast,
      timezone,
      utcOffsetSeconds,
      obtenidoEn,
    );
    const daily = this.normalizarOpenMeteoDiario(
      data,
      idEstablecimiento,
      coordenadas,
      forecast,
      timezone,
      utcOffsetSeconds,
      obtenidoEn,
    );
    return [...hourly, ...daily];
  }

  normalizarEstacion(
    datos: IClimaEstacionMeteorologica[],
    options: {
      idEstablecimiento: string;
      estacionId?: string;
      estacionNombre?: string;
      timezone: string;
      granularidad: 'hourly' | 'daily';
      coordenadas: ICoordenadas;
    },
  ): IObservacionMeteorologicaNormalizada[] {
    const obtenidoEn = new Date().toISOString();
    return (datos || [])
      .filter(
        (item) =>
          !!item?.fecha &&
          Number.isFinite(new Date(item.fecha as string).getTime()),
      )
      .map((item) => {
        const flags: string[] = [];
        const values: IValoresMeteorologicosNormalizados = {};
        const sourceByVariable: IObservacionMeteorologicaNormalizada['fuentePorVariable'] =
          {};
        const stateByVariable: IObservacionMeteorologicaNormalizada['estadoPorVariable'] =
          {};
        const isDaily = options.granularidad === 'daily';
        const temperature = this.value(
          item.temperatura,
          isDaily ? 'avg' : 'last',
        );
        const humidity = this.value(item.humedad, isDaily ? 'avg' : 'last');

        if (isDaily) {
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'temperatureMinC',
            item.temperatura?.min,
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'temperatureMeanC',
            temperature,
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'temperatureMaxC',
            item.temperatura?.max,
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'relativeHumidityMinPct',
            item.humedad?.min,
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'relativeHumidityMeanPct',
            humidity,
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'relativeHumidityMaxPct',
            item.humedad?.max,
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'precipitationMm',
            this.value(item.lluvia, 'sum'),
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'rainMm',
            this.value(item.lluvia, 'sum'),
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'windSpeedMs',
            this.kmhToMs(this.value(item.velocidadViento, 'avg')),
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'windSpeedMaxMs',
            this.kmhToMs(item.velocidadViento?.max),
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'windGustMs',
            this.kmhToMs(item.rafagaViento?.max ?? item.rafagaViento?.last),
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'windDirectionDeg',
            item.direccionViento?.avg,
            'station',
          );
          const radiationAverageWm2 = this.value(item.radiacionSolar, 'avg');
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'shortwaveRadiationMjM2',
            radiationAverageWm2 === undefined
              ? undefined
              : radiationAverageWm2 * 0.0864,
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'et0Mm',
            this.value(item.et0, 'result'),
            'station',
          );
        } else {
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'temperatureC',
            temperature,
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'relativeHumidityPct',
            humidity,
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'precipitationMm',
            this.value(item.lluvia, 'sum'),
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'rainMm',
            this.value(item.lluvia, 'sum'),
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'windSpeedMs',
            this.kmhToMs(this.value(item.velocidadViento, 'avg')),
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'windGustMs',
            this.kmhToMs(item.rafagaViento?.max ?? item.rafagaViento?.last),
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'windDirectionDeg',
            item.direccionViento?.avg ?? item.direccionViento?.last,
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'shortwaveRadiationWm2',
            this.value(item.radiacionSolar, 'avg'),
            'station',
          );
          this.assignScalar(
            values,
            sourceByVariable,
            stateByVariable,
            flags,
            'et0Mm',
            this.value(item.et0, 'result'),
            'station',
          );
        }

        const dewPoint = calcularPuntoRocioC(temperature, humidity);
        const vpd = calcularVpdKpa(temperature, humidity);
        const derivedSource: FuenteMeteorologicaNormalizada = 'derived_station';
        this.assignScalar(
          values,
          sourceByVariable,
          stateByVariable,
          flags,
          'dewPointC',
          dewPoint,
          derivedSource,
        );
        this.assignScalar(
          values,
          sourceByVariable,
          stateByVariable,
          flags,
          isDaily ? 'vpdMeanKpa' : 'vpdKpa',
          vpd,
          derivedSource,
        );
        values.soilTemperatureC = this.normalizarCapas(item.temperaturaSuelo);
        values.soilMoistureM3M3 = this.normalizarCapas(item.humedadSuelo, true);
        if (values.soilTemperatureC)
          sourceByVariable.soilTemperatureC = 'station';
        if (values.soilMoistureM3M3)
          sourceByVariable.soilMoistureM3M3 = 'station';

        const timestamp = new Date(item.fecha as string).toISOString();
        const fechaLocal = this.formatDateInTimezone(
          timestamp,
          options.timezone,
        );
        const required = isDaily ? REQUIRED_DAILY : REQUIRED_HOURLY;
        return {
          idEstablecimiento: options.idEstablecimiento,
          timestamp,
          fechaLocal,
          timezone: options.timezone,
          granularidad: options.granularidad,
          estado: 'observed',
          esPronostico: false,
          valores: values,
          fuente: 'station',
          fuentePorVariable: sourceByVariable,
          estadoPorVariable: stateByVariable,
          banderasCalidad: [...new Set(flags)],
          completitudPct: calcularCompletitud(values, required),
          estacionId: options.estacionId,
          estacionNombre: options.estacionNombre || item.estacion,
          coordenadas: options.coordenadas,
          obtenidoEn,
        };
      });
  }

  fusionar(
    station: IObservacionMeteorologicaNormalizada[],
    openMeteo: IObservacionMeteorologicaNormalizada[],
  ): IObservacionMeteorologicaNormalizada[] {
    const all = new Map<
      string,
      {
        station?: IObservacionMeteorologicaNormalizada;
        open?: IObservacionMeteorologicaNormalizada;
      }
    >();
    for (const observation of station) {
      const key = this.intervalKey(observation);
      const existing = all.get(key)?.station;
      if (existing) {
        observation.banderasCalidad = [
          ...new Set([
            ...observation.banderasCalidad,
            'duplicate_station_interval',
          ]),
        ];
      }
      all.set(key, { ...(all.get(key) || {}), station: observation });
    }
    for (const observation of openMeteo) {
      const key = this.intervalKey(observation);
      all.set(key, { ...(all.get(key) || {}), open: observation });
    }
    return [...all.values()]
      .map(({ station: stationItem, open }) =>
        this.mergeInterval(stationItem, open),
      )
      .filter((item): item is IObservacionMeteorologicaNormalizada => !!item)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private normalizarOpenMeteoHorario(
    data: any,
    idEstablecimiento: string,
    coordenadas: ICoordenadas,
    forecast: boolean,
    timezone: string,
    utcOffsetSeconds: number,
    obtenidoEn: string,
  ): IObservacionMeteorologicaNormalizada[] {
    const hourly = data.hourly;
    const times: string[] = hourly?.time || [];
    return times.map((localTime, index) => {
      const timestamp = this.localTimeToIso(localTime, utcOffsetSeconds);
      const pointForecast =
        forecast && new Date(timestamp).getTime() > Date.now();
      const values: IValoresMeteorologicosNormalizados = {};
      const sources: IObservacionMeteorologicaNormalizada['fuentePorVariable'] =
        {};
      const states: IObservacionMeteorologicaNormalizada['estadoPorVariable'] =
        {};
      const flags: string[] = [];
      const assign = (key: VariableMeteorologicaNormalizada, raw: unknown) =>
        this.assignScalar(
          values,
          sources,
          states,
          flags,
          key,
          raw,
          'open_meteo',
          pointForecast ? 'forecast' : 'estimated',
        );
      assign('temperatureC', hourly.temperature_2m?.[index]);
      assign('relativeHumidityPct', hourly.relative_humidity_2m?.[index]);
      assign('dewPointC', hourly.dew_point_2m?.[index]);
      assign('precipitationMm', hourly.precipitation?.[index]);
      assign('rainMm', hourly.rain?.[index]);
      assign('windSpeedMs', hourly.wind_speed_10m?.[index]);
      assign('windDirectionDeg', hourly.wind_direction_10m?.[index]);
      assign('windGustMs', hourly.wind_gusts_10m?.[index]);
      assign('shortwaveRadiationWm2', hourly.shortwave_radiation?.[index]);
      assign('vpdKpa', hourly.vapour_pressure_deficit?.[index]);
      assign('et0Mm', hourly.et0_fao_evapotranspiration?.[index]);
      assign(
        'sunshineDurationHours',
        this.secondsToHours(hourly.sunshine_duration?.[index]),
      );
      values.soilTemperatureC = this.objectFromOpenMeteoLayers(
        hourly,
        index,
        'soil_temperature',
      );
      values.soilMoistureM3M3 = this.objectFromOpenMeteoLayers(
        hourly,
        index,
        'soil_moisture',
      );
      if (values.soilTemperatureC) sources.soilTemperatureC = 'open_meteo';
      if (values.soilMoistureM3M3) sources.soilMoistureM3M3 = 'open_meteo';
      return {
        idEstablecimiento,
        timestamp,
        fechaLocal: String(localTime).slice(0, 10),
        timezone,
        granularidad: 'hourly',
        estado: pointForecast ? 'forecast' : 'estimated',
        esPronostico: pointForecast,
        valores: values,
        fuente: 'open_meteo',
        fuentePorVariable: sources,
        estadoPorVariable: states,
        banderasCalidad: [...new Set(flags)],
        completitudPct: calcularCompletitud(values, REQUIRED_HOURLY),
        coordenadas,
        altitudM: this.number(data.elevation),
        obtenidoEn,
      };
    });
  }

  private normalizarOpenMeteoDiario(
    data: any,
    idEstablecimiento: string,
    coordenadas: ICoordenadas,
    forecast: boolean,
    timezone: string,
    utcOffsetSeconds: number,
    obtenidoEn: string,
  ): IObservacionMeteorologicaNormalizada[] {
    const daily = data.daily;
    const times: string[] = daily?.time || [];
    return times.map((date, index) => {
      const values: IValoresMeteorologicosNormalizados = {};
      const sources: IObservacionMeteorologicaNormalizada['fuentePorVariable'] =
        {};
      const states: IObservacionMeteorologicaNormalizada['estadoPorVariable'] =
        {};
      const flags: string[] = [];
      const assign = (key: VariableMeteorologicaNormalizada, raw: unknown) =>
        this.assignScalar(
          values,
          sources,
          states,
          flags,
          key,
          raw,
          'open_meteo',
          forecast ? 'forecast' : 'estimated',
        );
      assign('temperatureMinC', daily.temperature_2m_min?.[index]);
      assign('temperatureMeanC', daily.temperature_2m_mean?.[index]);
      assign('temperatureMaxC', daily.temperature_2m_max?.[index]);
      assign('relativeHumidityMinPct', daily.relative_humidity_2m_min?.[index]);
      assign(
        'relativeHumidityMeanPct',
        daily.relative_humidity_2m_mean?.[index],
      );
      assign('relativeHumidityMaxPct', daily.relative_humidity_2m_max?.[index]);
      assign('dewPointC', daily.dew_point_2m_mean?.[index]);
      assign('precipitationMm', daily.precipitation_sum?.[index]);
      assign('rainMm', daily.rain_sum?.[index]);
      assign('precipitationHours', daily.precipitation_hours?.[index]);
      assign('windSpeedMs', daily.wind_speed_10m_mean?.[index]);
      assign('windSpeedMaxMs', daily.wind_speed_10m_max?.[index]);
      assign('windDirectionDeg', daily.wind_direction_10m_dominant?.[index]);
      assign('windGustMs', daily.wind_gusts_10m_max?.[index]);
      assign('shortwaveRadiationMjM2', daily.shortwave_radiation_sum?.[index]);
      assign('et0Mm', daily.et0_fao_evapotranspiration?.[index]);
      assign(
        'sunshineDurationHours',
        this.secondsToHours(daily.sunshine_duration?.[index]),
      );
      assign(
        'daylightDurationHours',
        this.secondsToHours(daily.daylight_duration?.[index]),
      );
      values.sunrise = daily.sunrise?.[index];
      values.sunset = daily.sunset?.[index];
      if (values.sunrise) sources.sunrise = 'open_meteo';
      if (values.sunset) sources.sunset = 'open_meteo';
      const timestamp = this.localTimeToIso(`${date}T12:00`, utcOffsetSeconds);
      return {
        idEstablecimiento,
        timestamp,
        fechaLocal: date,
        timezone,
        granularidad: 'daily',
        estado: forecast ? 'forecast' : 'estimated',
        esPronostico: forecast,
        valores: values,
        fuente: 'open_meteo',
        fuentePorVariable: sources,
        estadoPorVariable: states,
        banderasCalidad: [...new Set(flags)],
        completitudPct: calcularCompletitud(values, REQUIRED_DAILY),
        coordenadas,
        altitudM: this.number(data.elevation),
        obtenidoEn,
      };
    });
  }

  private mergeInterval(
    station?: IObservacionMeteorologicaNormalizada,
    open?: IObservacionMeteorologicaNormalizada,
  ): IObservacionMeteorologicaNormalizada | undefined {
    if (!station) return open;
    if (!open) return station;
    const values: IValoresMeteorologicosNormalizados = { ...open.valores };
    const sources = { ...open.fuentePorVariable };
    const states = { ...(open.estadoPorVariable || {}) };
    for (const key of Object.keys(open.valores) as Array<
      keyof IValoresMeteorologicosNormalizados
    >) {
      const stationValue = station.valores[key];
      if (stationValue === undefined || stationValue === null) {
        (sources as any)[key] = 'gap_filled';
      }
    }
    for (const key of Object.keys(station.valores) as Array<
      keyof IValoresMeteorologicosNormalizados
    >) {
      const stationValue = station.valores[key];
      if (stationValue === undefined || stationValue === null) continue;
      if (typeof stationValue === 'number' && !Number.isFinite(stationValue))
        continue;
      if (typeof stationValue === 'object' && !Object.keys(stationValue).length)
        continue;
      (values as any)[key] =
        typeof stationValue === 'object' &&
        typeof (open.valores as any)[key] === 'object'
          ? { ...(open.valores as any)[key], ...stationValue }
          : stationValue;
      (sources as any)[key] =
        typeof stationValue === 'object' &&
        typeof (open.valores as any)[key] === 'object'
          ? 'mixed'
          : (station.fuentePorVariable as any)[key] || 'station';
      (states as any)[key] = 'observed';
    }
    const used = new Set(Object.values(sources));
    const hasStation = [...used].some((source) =>
      String(source).includes('station'),
    );
    const hasOpen =
      used.has('open_meteo') ||
      used.has('derived_open_meteo') ||
      used.has('gap_filled');
    const required =
      station.granularidad === 'daily' ? REQUIRED_DAILY : REQUIRED_HOURLY;
    return {
      ...open,
      timestamp:
        station.granularidad === 'hourly' ? station.timestamp : open.timestamp,
      fechaLocal: open.fechaLocal || station.fechaLocal,
      estado: hasStation ? 'observed' : open.estado,
      valores: values,
      fuente:
        hasStation && hasOpen ? 'mixed' : hasStation ? 'station' : 'open_meteo',
      fuentePorVariable: sources,
      estadoPorVariable: states,
      banderasCalidad: [
        ...new Set([...station.banderasCalidad, ...open.banderasCalidad]),
      ],
      completitudPct: calcularCompletitud(values, required),
      estacionId: station.estacionId,
      estacionNombre: station.estacionNombre,
      obtenidoEn: new Date().toISOString(),
    };
  }

  private assignScalar(
    values: IValoresMeteorologicosNormalizados,
    sources: IObservacionMeteorologicaNormalizada['fuentePorVariable'],
    states: IObservacionMeteorologicaNormalizada['estadoPorVariable'],
    flags: string[],
    key: VariableMeteorologicaNormalizada,
    raw: unknown,
    source: FuenteMeteorologicaNormalizada,
    state: EstadoDatoMeteorologico = 'observed',
  ): void {
    const parsed = validarVariableMeteorologica(key, raw);
    if (parsed === undefined) {
      if (raw !== undefined && raw !== null && raw !== '')
        flags.push(`invalid_${key}`);
      return;
    }
    (values as any)[key] = parsed;
    sources[key] = source;
    if (states) states[key] = state;
  }

  private normalizarCapas(
    layers?: {
      [level: number]: { avg?: number; last?: number; result?: number };
    },
    fraction = false,
  ): Record<string, number> | undefined {
    if (!layers) return undefined;
    const result: Record<string, number> = {};
    for (const [level, values] of Object.entries(layers)) {
      let value = this.number(values?.avg ?? values?.last ?? values?.result);
      if (value === undefined) continue;
      if (fraction && value > 1 && value <= 100) value /= 100;
      if (fraction && (value < 0 || value > 1)) continue;
      result[`0-${level}`] = value;
    }
    return Object.keys(result).length ? result : undefined;
  }

  private objectFromOpenMeteoLayers(
    hourly: any,
    index: number,
    prefix: 'soil_temperature' | 'soil_moisture',
  ): Record<string, number> | undefined {
    const result: Record<string, number> = {};
    const fields = [
      ['0-7', `${prefix}_0_to_7cm`],
      ['7-28', `${prefix}_7_to_28cm`],
      ['28-100', `${prefix}_28_to_100cm`],
      ['100-255', `${prefix}_100_to_255cm`],
    ] as const;
    for (const [depth, field] of fields) {
      const value = this.number(hourly?.[field]?.[index]);
      if (value !== undefined) result[depth] = value;
    }
    return Object.keys(result).length ? result : undefined;
  }

  private value(
    values:
      | {
          avg?: number;
          min?: number;
          max?: number;
          sum?: number;
          last?: number;
          result?: number;
        }
      | undefined,
    preferred: 'avg' | 'last' | 'sum' | 'result',
  ): number | undefined {
    return this.number(
      values?.[preferred] ??
        values?.avg ??
        values?.last ??
        values?.result ??
        values?.sum,
    );
  }

  private kmhToMs(value?: number): number | undefined {
    return value === undefined ? undefined : value / 3.6;
  }

  private number(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private secondsToHours(value: unknown): number | undefined {
    const seconds = this.number(value);
    return seconds === undefined ? undefined : seconds / 3600;
  }

  private localTimeToIso(localTime: string, offsetSeconds: number): string {
    const utcLike = Date.parse(`${localTime}:00Z`);
    return new Date(utcLike - offsetSeconds * 1000).toISOString();
  }

  private formatDateInTimezone(timestamp: string, timezone: string): string {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date(timestamp));
      const map = Object.fromEntries(
        parts.map((part) => [part.type, part.value]),
      );
      return `${map.year}-${map.month}-${map.day}`;
    } catch {
      return timestamp.slice(0, 10);
    }
  }

  private intervalKey(
    observation: IObservacionMeteorologicaNormalizada,
  ): string {
    return observation.granularidad === 'daily'
      ? `daily|${observation.fechaLocal}`
      : `hourly|${observation.timestamp}|${observation.esPronostico}`;
  }
}
