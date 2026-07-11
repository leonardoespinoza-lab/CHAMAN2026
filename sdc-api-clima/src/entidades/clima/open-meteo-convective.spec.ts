import { ClimaService } from './service';

describe('ClimaService Open-Meteo convectivo', () => {
  it('normaliza weather code, CAPE, chaparrones y rafagas en el pronostico diario', async () => {
    const service = new ClimaService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const fetchSpy = jest
      .spyOn(service as any, 'fetchOpenMeteoJson')
      .mockResolvedValue({
        daily: {
          time: ['2026-07-17'],
          temperature_2m_max: [19.9],
          temperature_2m_min: [14.1],
          temperature_2m_mean: [17],
          relative_humidity_2m_max: [99],
          relative_humidity_2m_min: [75],
          relative_humidity_2m_mean: [90],
          precipitation_sum: [12.6],
          precipitation_probability_max: [38],
          showers_sum: [12.6],
          weather_code: [95],
          wind_speed_10m_max: [22.9],
          wind_speed_10m_mean: [15],
          wind_gusts_10m_max: [35],
          wind_direction_10m_dominant: [180],
          shortwave_radiation_sum: [10],
          et0_fao_evapotranspiration: [1.2],
        },
        hourly: {
          time: ['2026-07-17T00:00', '2026-07-17T12:00'],
          cape: [500, 1500],
        },
      });

    const resultado = await (service as any).getPronosticoOpenMeteo({
      lat: -33.14,
      lng: -64.23,
    });

    const url = fetchSpy.mock.calls[0][0] as URL;
    expect(url.searchParams.get('daily')).toContain('weather_code');
    expect(url.searchParams.get('daily')).toContain('showers_sum');
    expect(url.searchParams.get('daily')).toContain('wind_gusts_10m_max');
    expect(url.searchParams.get('hourly')).toBe('cape');
    expect(resultado[0]).toMatchObject({
      lluvia: 12.6,
      probabilidadLluvia: 38,
      showers: 12.6,
      weatherCode: 95,
      cape: 1500,
      rafagaViento: 35,
    });
  });
});
