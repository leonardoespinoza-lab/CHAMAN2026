import { IObservacionMeteorologicaNormalizada } from 'modelos/src';
import { WeatherSourceResolverService } from './weather-source-resolver.service';

describe('WeatherSourceResolverService', () => {
  const service = new WeatherSourceResolverService();

  it('prioriza la central por variable y completa ausencias con Open-Meteo', () => {
    const open = service.normalizarOpenMeteo(
      {
        timezone: 'America/Argentina/Cordoba',
        utc_offset_seconds: -10800,
        elevation: 90,
        hourly: {
          time: ['2026-07-13T10:00'],
          temperature_2m: [15],
          relative_humidity_2m: [80],
          precipitation: [1.2],
          rain: [1.2],
          wind_speed_10m: [2],
          shortwave_radiation: [220],
          vapour_pressure_deficit: [0.34],
          et0_fao_evapotranspiration: [0.08],
        },
        daily: { time: [] },
      },
      'est-1',
      { lat: -32.7, lng: -61.9 },
      false,
    );
    const station = service.normalizarEstacion(
      [
        {
          fecha: '2026-07-13T13:00:00.000Z',
          temperatura: { last: 20 },
          humedad: { last: 72 },
        } as any,
      ],
      {
        idEstablecimiento: 'est-1',
        estacionId: 'station-1',
        estacionNombre: 'Central lote norte',
        timezone: 'America/Argentina/Cordoba',
        granularidad: 'hourly',
        coordenadas: { lat: -32.7, lng: -61.9 },
      },
    );

    const [result] = service.fusionar(station, open);
    expect(result.valores.temperatureC).toBe(20);
    expect(result.fuentePorVariable.temperatureC).toBe('station');
    expect(result.valores.precipitationMm).toBe(1.2);
    expect(result.fuentePorVariable.precipitationMm).toBe('gap_filled');
    expect(result.fuente).toBe('mixed');
    expect(result.estado).toBe('estimated');
    expect(result.esPronostico).toBe(false);
    expect(result.estadoPorVariable?.temperatureC).toBe('observed');
    expect(result.estadoPorVariable?.precipitationMm).toBe('estimated');
    expect(result.banderasCalidad).toContain('mixed_variable_states');
  });

  it('rechaza un valor imposible de la central y conserva el respaldo valido', () => {
    const base: IObservacionMeteorologicaNormalizada = {
      idEstablecimiento: 'est-1',
      timestamp: '2026-07-13T13:00:00.000Z',
      fechaLocal: '2026-07-13',
      timezone: 'America/Argentina/Cordoba',
      granularidad: 'hourly',
      estado: 'estimated',
      esPronostico: false,
      valores: { temperatureC: 18, precipitationMm: 0 },
      fuente: 'open_meteo',
      fuentePorVariable: {
        temperatureC: 'open_meteo',
        precipitationMm: 'open_meteo',
      },
      banderasCalidad: [],
      completitudPct: 30,
      obtenidoEn: '2026-07-13T13:05:00.000Z',
    };
    const station = service.normalizarEstacion(
      [{ fecha: base.timestamp, temperatura: { last: 99 } } as any],
      {
        idEstablecimiento: 'est-1',
        estacionId: 'station-1',
        timezone: base.timezone,
        granularidad: 'hourly',
        coordenadas: { lat: -32.7, lng: -61.9 },
      },
    );
    const [result] = service.fusionar(station, [base]);
    expect(result.valores.temperatureC).toBe(18);
    expect(result.fuentePorVariable.temperatureC).toBe('gap_filled');
    expect(station[0].banderasCalidad).toContain('invalid_temperatureC');
  });

  it('convierte correctamente la hora local de Open-Meteo a UTC', () => {
    const [result] = service.normalizarOpenMeteo(
      {
        timezone: 'America/Argentina/Cordoba',
        utc_offset_seconds: -10800,
        hourly: { time: ['2026-07-13T10:00'], temperature_2m: [18] },
        daily: { time: [] },
      },
      'est-1',
      { lat: -32.7, lng: -61.9 },
      false,
    );
    expect(result.timestamp).toBe('2026-07-13T13:00:00.000Z');
    expect(result.fechaLocal).toBe('2026-07-13');
  });

  it('normaliza viento de la central desde km/h a m/s', () => {
    const [result] = service.normalizarEstacion(
      [
        {
          fecha: '2026-07-13T13:00:00.000Z',
          temperatura: { last: 18 },
          humedad: { last: 70 },
          velocidadViento: { avg: 36 },
        } as any,
      ],
      {
        idEstablecimiento: 'est-1',
        timezone: 'America/Argentina/Cordoba',
        granularidad: 'hourly',
        coordenadas: { lat: -32.7, lng: -61.9 },
      },
    );
    expect(result.valores.windSpeedMs).toBeCloseTo(10, 6);
  });

  it('ignora timestamps invalidos y marca intervalos duplicados', () => {
    const rows = service.normalizarEstacion(
      [
        { fecha: 'fecha-invalida', temperatura: { last: 10 } } as any,
        { fecha: '2026-07-13T13:00:00.000Z', temperatura: { last: 17 } } as any,
        { fecha: '2026-07-13T13:00:00.000Z', temperatura: { last: 18 } } as any,
      ],
      {
        idEstablecimiento: 'est-1',
        timezone: 'America/Argentina/Cordoba',
        granularidad: 'hourly',
        coordenadas: { lat: -32.7, lng: -61.9 },
      },
    );
    const merged = service.fusionar(rows, []);
    expect(rows).toHaveLength(2);
    expect(merged).toHaveLength(1);
    expect(merged[0].valores.temperatureC).toBe(18);
    expect(merged[0].banderasCalidad).toContain('duplicate_station_interval');
  });

  it('no presenta como observado un intervalo mixto con variables de pronostico', () => {
    const open = service.normalizarOpenMeteo(
      {
        timezone: 'America/Argentina/Cordoba',
        utc_offset_seconds: -10800,
        hourly: {
          time: ['2099-07-18T10:00'],
          temperature_2m: [16],
          precipitation: [4],
        },
        daily: { time: [] },
      },
      'est-1',
      { lat: -32.7, lng: -61.9 },
      true,
    );
    const station = service.normalizarEstacion(
      [
        {
          fecha: '2099-07-18T13:00:00.000Z',
          temperatura: { last: 18 },
        } as any,
      ],
      {
        idEstablecimiento: 'est-1',
        timezone: 'America/Argentina/Cordoba',
        granularidad: 'hourly',
        coordenadas: { lat: -32.7, lng: -61.9 },
      },
    );

    const [result] = service.fusionar(station, open);

    expect(result.valores.temperatureC).toBe(18);
    expect(result.estadoPorVariable?.temperatureC).toBe('observed');
    expect(result.valores.precipitationMm).toBe(4);
    expect(result.estadoPorVariable?.precipitationMm).toBe('forecast');
    expect(result.estado).toBe('forecast');
    expect(result.esPronostico).toBe(true);
  });

  it('no deja que un agregado diario de central sin cobertura trazable desplace Open-Meteo', () => {
    const open = service.normalizarOpenMeteo(
      {
        timezone: 'America/Argentina/Cordoba',
        utc_offset_seconds: -10800,
        daily: {
          time: ['2026-07-13'],
          temperature_2m_min: [8],
          temperature_2m_mean: [14],
          temperature_2m_max: [20],
          relative_humidity_2m_mean: [70],
          precipitation_sum: [1],
          shortwave_radiation_sum: [12],
          et0_fao_evapotranspiration: [2],
        },
        hourly: { time: [] },
      },
      'est-1',
      { lat: -32.7, lng: -61.9 },
      false,
    );
    const station = service.normalizarEstacion(
      [
        {
          fecha: '2026-07-13T00:00:00.000Z',
          temperatura: { min: 4, avg: 10, max: 17 },
          humedad: { avg: 85 },
          lluvia: { sum: 6 },
        } as any,
      ],
      {
        idEstablecimiento: 'est-1',
        estacionId: 'station-1',
        timezone: 'America/Argentina/Cordoba',
        granularidad: 'daily',
        coordenadas: { lat: -32.7, lng: -61.9 },
      },
    );

    expect(station[0].estado).toBe('estimated');
    expect(station[0].fechaLocal).toBe('2026-07-13');
    expect(station[0].banderasCalidad).toContain(
      'station_daily_not_suitable_for_decision',
    );

    const [result] = service.fusionar(station, open);

    expect(result.valores.temperatureMeanC).toBe(14);
    expect(result.valores.precipitationMm).toBe(1);
    expect(result.fuentePorVariable.temperatureMeanC).toBe('open_meteo');
    expect(result.fuente).toBe('open_meteo');
    expect(result.banderasCalidad).toContain(
      'station_daily_rejected_unverified_coverage',
    );
  });

  it('acepta el agregado diario de central cuando 24 horas unicas prueban cobertura por variable', () => {
    const hourly = service.normalizarEstacion(
      Array.from({ length: 24 }, (_, hour) => ({
        fecha: new Date(Date.UTC(2026, 6, 13, hour + 3)).toISOString(),
        temperatura: { last: 10 + hour / 2 },
        humedad: { last: 80 },
        lluvia: { sum: 0 },
        velocidadViento: { avg: 12 },
        radiacionSolar: { avg: 100 },
        et0: { result: 0.1 },
      })) as any,
      {
        idEstablecimiento: 'est-1',
        estacionId: 'station-1',
        timezone: 'America/Argentina/Cordoba',
        granularidad: 'hourly',
        coordenadas: { lat: -32.7, lng: -61.9 },
      },
    );
    const coverage = service.calcularCoberturaAgregadosDiariosEstacion(hourly);
    const station = service.normalizarEstacion(
      [
        {
          fecha: '2026-07-13T12:00:00.000Z',
          temperatura: { min: 9, avg: 16, max: 23 },
          humedad: { avg: 80 },
          lluvia: { sum: 0 },
          velocidadViento: { avg: 12 },
          radiacionSolar: { avg: 100 },
          et0: { result: 2.4 },
        } as any,
      ],
      {
        idEstablecimiento: 'est-1',
        estacionId: 'station-1',
        timezone: 'America/Argentina/Cordoba',
        granularidad: 'daily',
        coordenadas: { lat: -32.7, lng: -61.9 },
        coberturaAgregadosDiariosPorFecha: coverage,
      },
    );
    const open = service.normalizarOpenMeteo(
      {
        timezone: 'America/Argentina/Cordoba',
        utc_offset_seconds: -10800,
        daily: {
          time: ['2026-07-13'],
          temperature_2m_min: [8],
          temperature_2m_mean: [14],
          temperature_2m_max: [20],
          relative_humidity_2m_mean: [70],
          precipitation_sum: [1],
          shortwave_radiation_sum: [12],
          et0_fao_evapotranspiration: [2],
        },
        hourly: { time: [] },
      },
      'est-1',
      { lat: -32.7, lng: -61.9 },
      false,
    );

    const [result] = service.fusionar(station, open);

    expect(coverage['2026-07-13'].temperatureMeanC).toBe(100);
    expect(station[0].estadoPorVariable?.temperatureMeanC).toBe('observed');
    expect(result.valores.temperatureMeanC).toBe(16);
    expect(result.fuentePorVariable.temperatureMeanC).toBe('station');
    expect(result.banderasCalidad).toContain(
      'station_daily_coverage_verified_from_hourly',
    );
  });

  it('rechaza 23 de 24 horas como prueba de un agregado diario completo', () => {
    const hourly = service.normalizarEstacion(
      Array.from({ length: 23 }, (_, hour) => ({
        fecha: new Date(Date.UTC(2026, 6, 13, hour + 3)).toISOString(),
        temperatura: { last: 15 },
      })) as any,
      {
        idEstablecimiento: 'est-1',
        timezone: 'America/Argentina/Cordoba',
        granularidad: 'hourly',
        coordenadas: { lat: -32.7, lng: -61.9 },
      },
    );
    const coverage = service.calcularCoberturaAgregadosDiariosEstacion(hourly);
    const [station] = service.normalizarEstacion(
      [
        {
          fecha: '2026-07-13T12:00:00.000Z',
          temperatura: { min: 9, avg: 16, max: 23 },
        } as any,
      ],
      {
        idEstablecimiento: 'est-1',
        timezone: 'America/Argentina/Cordoba',
        granularidad: 'daily',
        coordenadas: { lat: -32.7, lng: -61.9 },
        coberturaAgregadosDiariosPorFecha: coverage,
      },
    );

    expect(coverage['2026-07-13'].temperatureMeanC).toBeCloseTo(
      (23 / 24) * 100,
      5,
    );
    expect(station.estadoPorVariable?.temperatureMeanC).toBe('estimated');
    expect(station.banderasCalidad).toContain(
      'station_daily_not_suitable_for_decision',
    );
  });

  it('acepta 23 horas como dia completo cuando la zona IANA inicia DST', () => {
    const start = Date.parse('2026-03-08T05:00:00.000Z');
    const hourly = service.normalizarEstacion(
      Array.from({ length: 23 }, (_, hour) => ({
        fecha: new Date(start + hour * 3600000).toISOString(),
        temperatura: { last: 15 },
      })) as any,
      {
        idEstablecimiento: 'est-1',
        timezone: 'America/New_York',
        granularidad: 'hourly',
        coordenadas: { lat: 40.7, lng: -74 },
      },
    );
    const coverage = service.calcularCoberturaAgregadosDiariosEstacion(hourly);
    const [station] = service.normalizarEstacion(
      [
        {
          fecha: '2026-03-08T12:00:00.000Z',
          temperatura: { min: 9, avg: 16, max: 23 },
        } as any,
      ],
      {
        idEstablecimiento: 'est-1',
        timezone: 'America/New_York',
        granularidad: 'daily',
        coordenadas: { lat: 40.7, lng: -74 },
        coberturaAgregadosDiariosPorFecha: coverage,
      },
    );

    expect(coverage['2026-03-08'].temperatureMeanC).toBe(100);
    expect(station.estadoPorVariable?.temperatureMeanC).toBe('observed');
    expect(station.banderasCalidad).toContain(
      'station_daily_coverage_verified_from_hourly',
    );
  });

  it('no interpreta count como cobertura si falta el numero esperado de muestras', () => {
    const [station] = service.normalizarEstacion(
      [
        {
          fecha: '2026-07-13T12:00:00.000Z',
          temperatura: { min: 9, avg: 16, max: 23, count: 24 },
          humedad: { avg: 80, count: 24 },
          lluvia: { sum: 0, count: 24 },
        } as any,
      ],
      {
        idEstablecimiento: 'est-1',
        timezone: 'America/Argentina/Cordoba',
        granularidad: 'daily',
        coordenadas: { lat: -32.7, lng: -61.9 },
      },
    );

    expect(station.estadoPorVariable?.temperatureMeanC).toBe('estimated');
    expect(station.banderasCalidad).toContain(
      'station_daily_count_without_expected_samples',
    );
  });
});
