import { SensorWeatherOverlayService } from './sensor-weather-overlay.service';

describe('SensorWeatherOverlayService', () => {
  const lote = {
    _id: 'lot-1',
    ubicacion: { centro: { lat: -39, lng: -68 } },
  } as any;

  const fallback = (timestamp = '2026-07-10T03:00:00.000Z') =>
    ({
      idEstablecimiento: 'est-1',
      timestamp,
      fechaLocal: timestamp.slice(0, 10),
      timezone: 'America/Argentina/Buenos_Aires',
      granularidad: 'hourly',
      estado: 'estimated',
      esPronostico: false,
      valores: {
        temperatureC: 20,
        relativeHumidityPct: 50,
        precipitationMm: 1,
      },
      fuente: 'open_meteo',
      fuentePorVariable: {
        temperatureC: 'open_meteo',
        relativeHumidityPct: 'open_meteo',
        precipitationMm: 'open_meteo',
      },
      estadoPorVariable: {
        temperatureC: 'estimated',
        relativeHumidityPct: 'estimated',
        precipitationMm: 'estimated',
      },
      banderasCalidad: [],
      completitudPct: 60,
      obtenidoEn: '2026-07-10T04:00:00.000Z',
    }) as any;

  const report = (
    timestamp = '2026-07-10T03:12:00.000Z',
    temperature = 5,
    humidity = 82,
  ) => ({
    fecha: timestamp,
    datos: {
      valores: {
        Temperatura: [{ valores: { actual: temperature } }],
        Humedad: [{ valores: { actual: humidity } }],
      },
    },
  });

  const repository = (device: any, reports: any[]) => ({
    getDispositivos: jest.fn().mockResolvedValue({ datos: [device] }),
    getReportes: jest.fn().mockResolvedValue({
      datos: reports,
      totalCount: reports.length,
    }),
  });

  it('prioriza cualquier sensor LoRa asignado aunque no tenga ficha de calibracion', async () => {
    const service = new SensorWeatherOverlayService(
      repository(
        { _id: 'dev-1', idLote: 'lot-1', nombre: 'K-01' },
        [report()],
      ) as any,
    );

    const result = await service.overlay(
      lote,
      'est-1',
      '2026-07-10',
      [fallback()],
    );

    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].valores.temperatureC).toBe(5);
    expect(result.observations[0].valores.relativeHumidityPct).toBe(82);
    expect(result.observations[0].valores.precipitationMm).toBe(1);
    expect(result.observations[0].fuentePorVariable.temperatureC).toBe(
      'sensor',
    );
    expect(result.observations[0].fuentePorVariable.precipitationMm).toBe(
      'open_meteo',
    );
    expect(result.observations[0].fuente).toBe('mixed');
    expect(result.observations[0].banderasCalidad).toContain(
      'temperature_sensor_quality:calificado',
    );
    expect(result.fieldTemperatureDecisionReady).toBe(true);
    expect(result.fieldTemperatureQuality).toBe('calificado');
    expect(result.unqualifiedTemperatureSensorNames).toEqual([]);
    expect(result.warnings.join(' ')).toContain(
      'sensor LoRa asignado prioritario',
    );
    expect(result.warnings.join(' ')).not.toMatch(
      /calibraci[oó]n|referencia no calibrada|no sustituye/i,
    );
  });

  it('crea horas canonicas desde LoRa cuando Open-Meteo no tiene esa hora', async () => {
    const service = new SensorWeatherOverlayService(
      repository(
        { _id: 'dev-only', idLote: 'lot-1', nombre: 'K-ONLY' },
        [report()],
      ) as any,
    );

    const result = await service.overlay(lote, 'est-1', '2026-07-10', []);

    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].fuente).toBe('sensor');
    expect(result.observations[0].valores.temperatureC).toBe(5);
    expect(result.observations[0].valores.relativeHumidityPct).toBe(82);
    expect(result.fieldObservations).toHaveLength(1);
    expect(result.fieldTemperatureDecisionReady).toBe(true);
  });

  it('usa Open-Meteo exclusivamente para completar horas faltantes', async () => {
    const service = new SensorWeatherOverlayService(
      repository(
        { _id: 'dev-gaps', idLote: 'lot-1', nombre: 'K-GAPS' },
        [report('2026-07-10T03:12:00.000Z', 5, 82)],
      ) as any,
    );

    const result = await service.overlay(lote, 'est-1', '2026-07-10', [
      fallback('2026-07-10T03:00:00.000Z'),
      fallback('2026-07-10T04:00:00.000Z'),
    ]);

    expect(result.observations).toHaveLength(2);
    expect(result.observations[0].valores.temperatureC).toBe(5);
    expect(result.observations[0].fuentePorVariable.temperatureC).toBe(
      'sensor',
    );
    expect(result.observations[1].valores.temperatureC).toBe(20);
    expect(result.observations[1].fuentePorVariable.temperatureC).toBe(
      'open_meteo',
    );
  });

  it('aplica offsets opcionales existentes sin exigir metadatos adicionales', async () => {
    const service = new SensorWeatherOverlayService(
      repository(
        {
          _id: 'dev-offset',
          idLote: 'lot-1',
          nombre: 'K-OFFSET',
          calificacionMeteorologica: {
            offsetTemperaturaC: -0.7,
            humedadRelativa: { offset: -2 },
          },
        },
        [report()],
      ) as any,
    );

    const result = await service.overlay(
      lote,
      'est-1',
      '2026-07-10',
      [fallback()],
    );

    expect(result.observations[0].valores.temperatureC).toBeCloseTo(4.3, 6);
    expect(result.observations[0].valores.relativeHumidityPct).toBe(80);
    expect(result.fieldTemperatureDecisionReady).toBe(true);
  });

  it('promedia lecturas de una misma hora antes de integrarlas', async () => {
    const service = new SensorWeatherOverlayService(
      repository(
        { _id: 'dev-average', idLote: 'lot-1', nombre: 'K-AVG' },
        [
          report('2026-07-10T03:05:00.000Z', 4, 80),
          report('2026-07-10T03:35:00.000Z', 6, 84),
        ],
      ) as any,
    );

    const result = await service.overlay(lote, 'est-1', '2026-07-10', []);

    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].valores.temperatureC).toBe(5);
    expect(result.observations[0].valores.relativeHumidityPct).toBe(82);
  });

  it('conserva el historico de un sensor desconectado y solo advierte su antiguedad', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00.000Z'));
    try {
      const service = new SensorWeatherOverlayService(
        repository(
          { _id: 'dev-stale', idLote: 'lot-1', nombre: 'K-STALE' },
          [report('2026-07-10T03:12:00.000Z')],
        ) as any,
      );

      const result = await service.overlay(
        lote,
        'est-1',
        '2026-07-10',
        [fallback()],
      );

      expect(result.observations[0].valores.temperatureC).toBe(5);
      expect(result.fieldTemperatureDecisionReady).toBe(true);
      expect(result.warnings.join(' ')).toContain('se considera desconectado');
    } finally {
      jest.useRealTimers();
    }
  });

  it('nunca usa un canal declarado de suelo como temperatura de aire', async () => {
    const soilReport = report() as any;
    soilReport.datos.valores['Temperatura Suelo'] = [
      { profundidad: 20, valores: { actual: 9 } },
    ];
    const service = new SensorWeatherOverlayService(
      repository(
        {
          _id: 'dev-soil',
          idLote: 'lot-1',
          nombre: 'SONDA-SUELO',
          calificacionMeteorologica: { rolTemperatura: 'suelo' },
        },
        [soilReport],
      ) as any,
    );

    const result = await service.overlay(
      lote,
      'est-1',
      '2026-07-10',
      [fallback()],
    );

    expect(result.observations[0].valores.temperatureC).toBe(20);
    expect(result.observations[0].fuentePorVariable.temperatureC).toBe(
      'open_meteo',
    );
    expect(result.observations[0].valores.soilTemperatureC).toEqual({
      '20': 9,
    });
    expect(result.fieldTemperatureDecisionReady).toBe(false);
  });

  it('respeta el historial real de asignacion del dispositivo al lote', async () => {
    const service = new SensorWeatherOverlayService(
      repository(
        {
          _id: 'dev-history',
          idLote: 'lot-2',
          nombre: 'K-HISTORY',
          historialAsignacionesLote: [
            {
              idLote: 'lot-1',
              fechaDesde: '2026-07-10T04:00:00.000Z',
            },
          ],
        },
        [
          report('2026-07-10T03:12:00.000Z', 2, 90),
          report('2026-07-10T04:12:00.000Z', 7, 70),
        ],
      ) as any,
    );

    const result = await service.overlay(lote, 'est-1', '2026-07-10', []);

    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].timestamp).toBe('2026-07-10T04:00:00.000Z');
    expect(result.observations[0].valores.temperatureC).toBe(7);
  });

  it('pagina historias extensas sin perder las lecturas mas nuevas', async () => {
    const newest = Array.from({ length: 5000 }, (_, index) =>
      report(
        new Date(Date.UTC(2026, 6, 10, 3, 0, index % 60)).toISOString(),
        5,
        82,
      ),
    );
    const older = [report('2026-07-09T03:12:00.000Z', 3, 88)];
    const repo = {
      getDispositivos: jest.fn().mockResolvedValue({
        datos: [{ _id: 'dev-pages', idLote: 'lot-1', nombre: 'K-PAGES' }],
      }),
      getReportes: jest
        .fn()
        .mockResolvedValueOnce({ datos: newest, totalCount: 5001 })
        .mockResolvedValueOnce({ datos: older, totalCount: 5001 }),
    };
    const service = new SensorWeatherOverlayService(repo as any);

    const result = await service.overlay(lote, 'est-1', '2026-07-09', []);

    expect(repo.getReportes).toHaveBeenCalledTimes(2);
    expect(result.observations.map((item) => item.timestamp)).toContain(
      '2026-07-10T03:00:00.000Z',
    );
    expect(result.observations.map((item) => item.timestamp)).toContain(
      '2026-07-09T03:00:00.000Z',
    );
  });

  it('conserva la pagina mas nueva si una pagina historica falla', async () => {
    const newest = Array.from({ length: 5000 }, (_, index) =>
      report(
        new Date(Date.UTC(2026, 6, 10, 3, 0, index % 60)).toISOString(),
        5,
        82,
      ),
    );
    const repo = {
      getDispositivos: jest.fn().mockResolvedValue({
        datos: [{ _id: 'dev-partial', idLote: 'lot-1', nombre: 'K-PARTIAL' }],
      }),
      getReportes: jest
        .fn()
        .mockResolvedValueOnce({ datos: newest, totalCount: 5001 })
        .mockRejectedValueOnce(new Error('historical page unavailable')),
    };
    const service = new SensorWeatherOverlayService(repo as any);

    const result = await service.overlay(lote, 'est-1', '2026-07-10', []);

    expect(repo.getReportes).toHaveBeenCalledTimes(2);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].valores.temperatureC).toBe(5);
  });
});
