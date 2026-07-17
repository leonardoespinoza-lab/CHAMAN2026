import { ClimaService } from './service';
import { fusionarClimaConFallback } from './calidad-clima';

const times = (count: number, fecha = '2026-07-10') =>
  Array.from(
    { length: count },
    (_, hour) => `${fecha}T${String(hour).padStart(2, '0')}:00`,
  );

const hourlyPayload = (count = 24, fecha = '2026-07-10') => ({
  utc_offset_seconds: -10800,
  timezone: 'America/Argentina/Buenos_Aires',
  hourly: {
    time: times(count, fecha),
    temperature_2m: Array.from({ length: count }, (_, index) => 10 + index),
    relative_humidity_2m: Array.from(
      { length: count },
      (_, index) => 90 - index,
    ),
    precipitation: Array.from({ length: count }, () => 0),
    rain: Array.from({ length: count }, () => 0),
    wind_speed_10m: Array.from({ length: count }, () => 12),
  },
});

const diasInclusivos = (inicio: string, fin: string): string[] => {
  const actual = new Date(`${inicio}T00:00:00Z`);
  const limite = new Date(`${fin}T00:00:00Z`);
  const fechas: string[] = [];
  while (actual <= limite) {
    fechas.push(actual.toISOString().slice(0, 10));
    actual.setUTCDate(actual.getUTCDate() + 1);
  }
  return fechas;
};

const dailyPayloadRange = (inicio: string, fin: string) => {
  const fechas = diasInclusivos(inicio, fin);
  return {
    daily: {
      time: fechas,
      temperature_2m_max: fechas.map(() => 22),
      temperature_2m_min: fechas.map(() => 8),
      temperature_2m_mean: fechas.map(() => 15),
      relative_humidity_2m_max: fechas.map(() => 95),
      relative_humidity_2m_min: fechas.map(() => 55),
      relative_humidity_2m_mean: fechas.map(() => 75),
      precipitation_sum: fechas.map(() => 3),
      wind_speed_10m_max: fechas.map(() => 25),
      wind_speed_10m_mean: fechas.map(() => 12),
      wind_direction_10m_dominant: fechas.map(() => 180),
      shortwave_radiation_sum: fechas.map(() => 12),
      et0_fao_evapotranspiration: fechas.map(() => 2),
    },
  };
};

const dailyPayload = (fecha = '2026-07-10') => dailyPayloadRange(fecha, fecha);

const agrometPayloadRange = (inicio: string, fin: string) => {
  const fechas = diasInclusivos(inicio, fin);
  const horas = fechas.flatMap((fecha) => times(24, fecha));
  return {
    timezone: 'America/Argentina/Buenos_Aires',
    utc_offset_seconds: -10800,
    elevation: 250,
    hourly: {
      time: horas,
      temperature_2m: horas.map(() => 12),
      relative_humidity_2m: horas.map(() => 80),
      precipitation: horas.map(() => 0),
      shortwave_radiation: horas.map(() => 100),
      et0_fao_evapotranspiration: horas.map(() => 0.05),
    },
    daily: {
      time: fechas,
      temperature_2m_min: fechas.map(() => 5),
      temperature_2m_mean: fechas.map(() => 12),
      temperature_2m_max: fechas.map(() => 19),
      precipitation_sum: fechas.map(() => 0),
      shortwave_radiation_sum: fechas.map(() => 9),
      et0_fao_evapotranspiration: fechas.map(() => 2),
    },
  };
};

describe('fallback horario Open-Meteo', () => {
  const service = new ClimaService({} as any, {} as any, {} as any, {} as any);
  const ubicacion = { lat: -39.03, lng: -67.58 };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('solicita y parsea variables horarias sin degradar a agregado diario', async () => {
    const payload = hourlyPayload();
    payload.hourly.precipitation[1] = null as any;
    payload.hourly.rain[1] = 0.4;
    const fetch = jest
      .spyOn(service as any, 'fetchOpenMeteoJson')
      .mockResolvedValue(payload);

    const result = await (service as any).getOpenMeteoEntreFechas(
      ubicacion,
      '2026-07-10',
      '2026-07-11',
      'hourly',
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    const url = fetch.mock.calls[0][0] as URL;
    expect(url.searchParams.get('start_date')).toBe('2026-07-10');
    expect(url.searchParams.get('end_date')).toBe('2026-07-10');
    expect(url.searchParams.get('hourly')?.split(',')).toEqual([
      'temperature_2m',
      'relative_humidity_2m',
      'precipitation',
      'rain',
      'wind_speed_10m',
    ]);
    expect(url.searchParams.has('daily')).toBe(false);
    expect(result).toHaveLength(24);
    expect(result[0].fecha).toBe('2026-07-10T00:00:00-03:00');
    expect(result[23].fecha).toBe('2026-07-10T23:00:00-03:00');
    expect(result[1].lluvia?.sum).toBe(0.4);
    expect(result[0].velocidadViento?.avg).toBe(12);
    expect(result[0].calidadDatos).toMatchObject({
      nivel: 'media',
      fuente: 'open_meteo',
      cobertura: 1,
      fallback: true,
    });
  });

  it('consulta el agregado diario solo cuando hay menos de 18 horas validas', async () => {
    const fetch = jest
      .spyOn(service as any, 'fetchOpenMeteoJson')
      .mockImplementation(async (url: URL) =>
        url.searchParams.has('hourly') ? hourlyPayload(17) : dailyPayload(),
      );

    const fallback = await (service as any).getOpenMeteoEntreFechas(
      ubicacion,
      '2026-07-10',
      '2026-07-11',
      'hourly',
    );
    const result = fusionarClimaConFallback(
      [],
      fallback,
      '2026-07-10',
      '2026-07-11',
      'hourly',
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch.mock.calls[0][0] as URL).searchParams.has('hourly')).toBe(
      true,
    );
    expect((fetch.mock.calls[1][0] as URL).searchParams.has('daily')).toBe(
      true,
    );
    expect(result.datos).toHaveLength(1);
    expect(result.datos[0].lluvia?.sum).toBe(3);
    expect(result.diasFallbackHorario).toBe(0);
    expect(result.diasFallbackDiario).toBe(1);
  });

  it('preserva el pedido y parser diario para consumidores existentes', async () => {
    const fetch = jest
      .spyOn(service as any, 'fetchOpenMeteoJson')
      .mockResolvedValue(dailyPayload());

    const result = await (service as any).getOpenMeteoEntreFechas(
      ubicacion,
      '2026-07-10',
      '2026-07-11',
      'daily',
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    const url = fetch.mock.calls[0][0] as URL;
    expect(url.searchParams.get('start_date')).toBe('2026-07-10');
    expect(url.searchParams.get('end_date')).toBe('2026-07-10');
    expect(url.searchParams.has('daily')).toBe(true);
    expect(url.searchParams.has('hourly')).toBe(false);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      fuente: 'OpenMeteo',
      estacion: 'Open-Meteo',
      temperatura: { avg: 15 },
      humedad: { avg: 75 },
      lluvia: { sum: 3 },
    });
  });

  it('divide Archive y Forecast cuando el rango cruza el limite historico', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00Z'));
    const fetch = jest
      .spyOn(service as any, 'fetchOpenMeteoJson')
      .mockImplementation(async (url: URL) =>
        dailyPayloadRange(
          String(url.searchParams.get('start_date')),
          String(url.searchParams.get('end_date')),
        ),
      );

    const result = await (service as any).getOpenMeteoEntreFechas(
      ubicacion,
      '2026-04-10',
      '2026-04-20',
      'daily',
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    const urls = fetch.mock.calls.map(([url]) => url as URL);
    const archive = urls.find((url) => url.hostname.includes('archive-api'));
    const forecast = urls.find((url) => !url.hostname.includes('archive-api'));
    expect(archive?.searchParams.get('start_date')).toBe('2026-04-10');
    expect(archive?.searchParams.get('end_date')).toBe('2026-04-13');
    expect(forecast?.searchParams.get('start_date')).toBe('2026-04-14');
    expect(forecast?.searchParams.get('end_date')).toBe('2026-04-19');
    expect(result.map((item: any) => item.fecha.slice(0, 10))).toEqual(
      diasInclusivos('2026-04-10', '2026-04-19'),
    );
  });

  it('mantiene continuidad horaria a ambos lados del corte', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00Z'));
    const fetch = jest
      .spyOn(service as any, 'fetchOpenMeteoJson')
      .mockImplementation(async (url: URL) =>
        hourlyPayload(
          24,
          url.hostname.includes('archive-api') ? '2026-04-13' : '2026-04-14',
        ),
      );

    const result = await (service as any).getOpenMeteoHorarioEntreFechas(
      ubicacion,
      '2026-04-13',
      '2026-04-15',
      'hourly',
    );

    const urls = fetch.mock.calls.map(([url]) => url as URL);
    const archive = urls.find((url) => url.hostname.includes('archive-api'));
    const forecast = urls.find((url) => !url.hostname.includes('archive-api'));
    expect(archive?.searchParams.get('start_date')).toBe('2026-04-13');
    expect(archive?.searchParams.get('end_date')).toBe('2026-04-13');
    expect(forecast?.searchParams.get('start_date')).toBe('2026-04-14');
    expect(forecast?.searchParams.get('end_date')).toBe('2026-04-14');
    expect(result).toHaveLength(48);
    expect(new Set(result.map((item: any) => item.fecha.slice(0, 10)))).toEqual(
      new Set(['2026-04-13', '2026-04-14']),
    );
  });

  it('usa Forecast para el historico agrometeorologico dentro de los ultimos 92 dias', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00Z'));
    const fetch = jest
      .spyOn(service as any, 'fetchOpenMeteoJson')
      .mockImplementation(async (url: URL) =>
        agrometPayloadRange(
          String(url.searchParams.get('start_date')),
          String(url.searchParams.get('end_date')),
        ),
      );

    const result = await service.getOpenMeteoAgrometeorologia(
      ubicacion,
      '2026-04-14',
      '2026-04-16',
      false,
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    const url = fetch.mock.calls[0][0] as URL;
    expect(url.hostname).not.toContain('archive-api');
    expect(url.searchParams.get('start_date')).toBe('2026-04-14');
    expect(url.searchParams.get('end_date')).toBe('2026-04-16');
    expect(result.hourly.time).toHaveLength(72);
    expect(result.daily.time).toEqual([
      '2026-04-14',
      '2026-04-15',
      '2026-04-16',
    ]);
  });

  it('recompone Archive y Forecast sin perder dias ni alinear mal variables agrometeorologicas', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00Z'));
    const fetch = jest
      .spyOn(service as any, 'fetchOpenMeteoJson')
      .mockImplementation(async (url: URL) => {
        const payload = agrometPayloadRange(
          String(url.searchParams.get('start_date')),
          String(url.searchParams.get('end_date')),
        );
        if (url.hostname.includes('archive-api')) {
          delete (payload.hourly as any).et0_fao_evapotranspiration;
        }
        return payload;
      });

    const result = await service.getOpenMeteoAgrometeorologia(
      ubicacion,
      '2026-04-12',
      '2026-04-16',
      false,
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    const urls = fetch.mock.calls.map(([url]) => url as URL);
    const archive = urls.find((url) => url.hostname.includes('archive-api'));
    const forecast = urls.find((url) => !url.hostname.includes('archive-api'));
    expect(archive?.searchParams.get('start_date')).toBe('2026-04-12');
    expect(archive?.searchParams.get('end_date')).toBe('2026-04-13');
    expect(forecast?.searchParams.get('start_date')).toBe('2026-04-14');
    expect(forecast?.searchParams.get('end_date')).toBe('2026-04-16');
    expect(result.daily.time).toEqual(
      diasInclusivos('2026-04-12', '2026-04-16'),
    );
    expect(result.hourly.time).toHaveLength(120);
    expect(result.hourly.temperature_2m).toHaveLength(120);
    expect(result.hourly.et0_fao_evapotranspiration).toHaveLength(120);
    expect(result.hourly.et0_fao_evapotranspiration.slice(0, 48)).toEqual(
      Array(48).fill(undefined),
    );
    expect(result.hourly.et0_fao_evapotranspiration.slice(48)).toEqual(
      Array(72).fill(0.05),
    );
  });

  it('no consulta Open-Meteo para un intervalo vacio', async () => {
    const fetch = jest
      .spyOn(service as any, 'fetchOpenMeteoJson')
      .mockResolvedValue(dailyPayload());

    const result = await (service as any).getOpenMeteoEntreFechas(
      ubicacion,
      '2026-07-10',
      '2026-07-10',
      'daily',
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
