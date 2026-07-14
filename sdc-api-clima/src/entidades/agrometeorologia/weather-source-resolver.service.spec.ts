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
});
