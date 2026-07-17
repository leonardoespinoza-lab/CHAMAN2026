import { SensorWeatherOverlayService } from './sensor-weather-overlay.service';

describe('SensorWeatherOverlayService', () => {
  const base = (temperatureC = 20) =>
    [
      {
        idEstablecimiento: 'est-1',
        timestamp: '2026-07-10T03:00:00.000Z',
        fechaLocal: '2026-07-10',
        timezone: 'America/Argentina/Buenos_Aires',
        granularidad: 'hourly',
        estado: 'estimated',
        esPronostico: false,
        valores: { temperatureC, relativeHumidityPct: 50 },
        fuente: 'open_meteo',
        fuentePorVariable: {
          temperatureC: 'open_meteo',
          relativeHumidityPct: 'open_meteo',
        },
        banderasCalidad: [],
        completitudPct: 40,
        obtenidoEn: '2026-07-10T04:00:00.000Z',
      },
    ] as any;

  it('conserva un sensor no calificado como referencia sin reemplazar el fallback canonico', async () => {
    const repository = {
      getDispositivos: jest.fn().mockResolvedValue({
        datos: [{ _id: 'dev-1', idLote: 'lot-1', nombre: 'K-01' }],
      }),
      getReportes: jest.fn().mockResolvedValue({
        datos: [
          {
            fecha: '2026-07-10T03:12:00.000Z',
            datos: {
              valores: {
                Temperatura: [{ valores: { actual: 5 } }],
                Humedad: [{ valores: { actual: 82 } }],
              },
            },
          },
        ],
      }),
    };
    const service = new SensorWeatherOverlayService(repository as any);

    const result = await service.overlay(
      { _id: 'lot-1', ubicacion: { centro: { lat: -39, lng: -68 } } } as any,
      'est-1',
      '2026-07-10',
      base(),
    );

    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].valores.temperatureC).toBe(20);
    expect(result.observations[0].valores.relativeHumidityPct).toBe(50);
    expect(result.observations[0].fuentePorVariable.temperatureC).toBe(
      'open_meteo',
    );
    expect(result.observations[0].fuente).toBe('open_meteo');
    expect(result.observations[0].estado).toBe('estimated');
    expect(result.observations[0].esPronostico).toBe(false);
    expect(result.sensorNames).toEqual(['K-01']);
    expect(result.fieldTemperatureSensorNames).toEqual(['K-01']);
    expect(result.fieldTemperatureQuality).toBe('referencia');
    expect(result.fieldObservations[0].valores.temperatureC).toBe(5);
    expect(result.fieldObservations[0].fuentePorVariable.temperatureC).toBe(
      'sensor',
    );
    expect(result.fieldTemperatureDecisionReady).toBe(false);
    expect(result.unqualifiedTemperatureSensorNames).toEqual(['K-01']);
    expect(result.observations[0].banderasCalidad).toContain(
      'temperature_sensor_quality:referencia',
    );
    expect(result.observations[0].banderasCalidad).toContain(
      'field_sensor_reference:temperatureC:5',
    );
    expect(result.observations[0].banderasCalidad).toContain(
      'field_sensor_reference:relativeHumidityPct:82',
    );
    expect(result.warnings.join(' ')).toContain(
      'no sustituye la fuente canonica',
    );
    expect(result.warnings.join(' ')).toContain(
      'estacion/Open-Meteo mantiene la variable de decision',
    );
  });

  it('conserva la lectura no calificada solo en la serie de campo cuando no existe fallback canonico', async () => {
    const repository = {
      getDispositivos: jest.fn().mockResolvedValue({
        datos: [{ _id: 'dev-reference-only', idLote: 'lot-1', nombre: 'K-01' }],
      }),
      getReportes: jest.fn().mockResolvedValue({
        datos: [
          {
            fecha: '2026-07-10T03:12:00.000Z',
            datos: {
              valores: {
                Temperatura: [{ valores: { actual: 5 } }],
                Humedad: [{ valores: { actual: 92 } }],
              },
            },
          },
        ],
      }),
    };
    const service = new SensorWeatherOverlayService(repository as any);

    const result = await service.overlay(
      { _id: 'lot-1' } as any,
      'est-1',
      '2026-07-10',
      [],
    );

    expect(result.observations).toEqual([]);
    expect(result.fieldObservations).toHaveLength(1);
    expect(result.fieldObservations[0].valores.temperatureC).toBe(5);
    expect(result.fieldObservations[0].valores.relativeHumidityPct).toBe(92);
    expect(result.fieldObservations[0].banderasCalidad).toContain(
      'temperature_sensor_quality:referencia',
    );
    expect(result.fieldObservations[0].banderasCalidad).toContain(
      'humidity_sensor_quality:referencia',
    );
    expect(result.fieldTemperatureDecisionReady).toBe(false);
    expect(result.warnings.join(' ')).toContain(
      'exclusivamente como referencia paralela',
    );
  });

  it('no completa humedad canonica faltante con un sensor de referencia', async () => {
    const repository = {
      getDispositivos: jest.fn().mockResolvedValue({
        datos: [{ _id: 'dev-reference-rh', idLote: 'lot-1', nombre: 'K-01' }],
      }),
      getReportes: jest.fn().mockResolvedValue({
        datos: [
          {
            fecha: '2026-07-10T03:12:00.000Z',
            datos: {
              valores: {
                Humedad: [{ valores: { actual: 92 } }],
              },
            },
          },
        ],
      }),
    };
    const service = new SensorWeatherOverlayService(repository as any);
    const fallback = base();
    delete fallback[0].valores.relativeHumidityPct;
    delete fallback[0].fuentePorVariable.relativeHumidityPct;

    const result = await service.overlay(
      { _id: 'lot-1' } as any,
      'est-1',
      '2026-07-10',
      fallback,
    );

    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].valores.relativeHumidityPct).toBeUndefined();
    expect(
      result.observations[0].fuentePorVariable.relativeHumidityPct,
    ).toBeUndefined();
    expect(result.observations[0].banderasCalidad).toContain(
      'field_sensor_reference:relativeHumidityPct:92',
    );
    expect(result.fieldObservations[0].valores.relativeHumidityPct).toBe(92);
  });

  it('habilita decisiones biologicas solo con sensor calificado y aplica su offset trazable', async () => {
    const repository = {
      getDispositivos: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'dev-qualified',
            idLote: 'lot-1',
            nombre: 'K-02',
            calificacionMeteorologica: {
              estado: 'calificado',
              rolTemperatura: 'aire_2m',
              alturaM: 2,
              abrigoRadiacion: true,
              exactitudTemperaturaC: 0.2,
              fechaCalibracion: '2026-06-01',
              proximaCalibracion: '2027-06-01',
              offsetTemperaturaC: -0.7,
              fuenteCalibracion: 'Certificado laboratorio 2026-14',
            },
          },
        ],
      }),
      getReportes: jest.fn().mockResolvedValue({
        datos: [
          {
            fecha: '2026-07-10T03:12:00.000Z',
            datos: {
              valores: {
                Temperatura: [{ valores: { actual: 5 } }],
                Humedad: [{ valores: { actual: 82 } }],
              },
            },
          },
        ],
      }),
    };
    const service = new SensorWeatherOverlayService(repository as any);

    const result = await service.overlay(
      { _id: 'lot-1' } as any,
      'est-1',
      '2026-07-10',
      base(),
    );

    expect(result.observations[0].valores.temperatureC).toBeCloseTo(4.3, 6);
    expect(result.observations[0].valores.relativeHumidityPct).toBe(50);
    expect(result.observations[0].fuentePorVariable.temperatureC).toBe(
      'sensor',
    );
    expect(result.observations[0].fuentePorVariable.relativeHumidityPct).toBe(
      'open_meteo',
    );
    expect(result.observations[0].banderasCalidad).toContain(
      'temperature_sensor_quality:calificado',
    );
    expect(result.observations[0].banderasCalidad).toContain(
      'humidity_sensor_quality:referencia',
    );
    expect(result.observations[0].banderasCalidad).toContain(
      'field_sensor_reference:relativeHumidityPct:82',
    );
    expect(result.fieldTemperatureQuality).toBe('calificado');
    expect(result.fieldTemperatureSensorNames).toEqual(['K-02']);
    expect(result.fieldObservations[0].valores.temperatureC).toBeCloseTo(
      4.3,
      6,
    );
    expect(result.fieldTemperatureDecisionReady).toBe(true);
    expect(result.unqualifiedTemperatureSensorNames).toEqual([]);
    expect(result.warnings.join(' ')).not.toContain(
      'no sustituye la fuente canonica',
    );
  });

  it('solo sustituye humedad cuando posee su propia calificacion trazable', async () => {
    const repository = {
      getDispositivos: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'dev-qualified-rh',
            idLote: 'lot-1',
            nombre: 'K-RH',
            calificacionMeteorologica: {
              estado: 'referencia',
              humedadRelativa: {
                estado: 'calificado',
                rol: 'aire_2m',
                alturaM: 2,
                abrigoRadiacion: true,
                exactitud: 2.5,
                fechaCalibracion: '2026-06-01',
                proximaCalibracion: '2027-06-01',
                offset: -2,
                fuenteCalibracion: 'Patron RH 2026-8',
              },
            },
          },
        ],
      }),
      getReportes: jest.fn().mockResolvedValue({
        datos: [
          {
            fecha: '2026-07-10T03:12:00.000Z',
            datos: {
              valores: {
                Temperatura: [{ valores: { actual: 5 } }],
                Humedad: [{ valores: { actual: 82 } }],
              },
            },
          },
        ],
      }),
    };
    const service = new SensorWeatherOverlayService(repository as any);

    const result = await service.overlay(
      { _id: 'lot-1' } as any,
      'est-1',
      '2026-07-10',
      base(),
    );

    expect(result.observations[0].valores.temperatureC).toBe(20);
    expect(result.observations[0].fuentePorVariable.temperatureC).toBe(
      'open_meteo',
    );
    expect(result.observations[0].valores.relativeHumidityPct).toBe(80);
    expect(result.observations[0].fuentePorVariable.relativeHumidityPct).toBe(
      'sensor',
    );
    expect(result.fieldObservations[0].banderasCalidad).toContain(
      'temperature_sensor_quality:referencia',
    );
    expect(result.fieldObservations[0].banderasCalidad).toContain(
      'humidity_sensor_quality:calificado',
    );
  });

  it('reprocesa cada variable con el intervalo historico que regia en la fecha original', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    try {
      const repository = {
        getDispositivos: jest.fn().mockResolvedValue({
          datos: [
            {
              _id: 'dev-variable-history',
              idLote: 'lot-1',
              nombre: 'K-HISTORY',
              calificacionMeteorologica: {
                estado: 'calificado',
                rolTemperatura: 'aire_2m',
                alturaM: 2,
                abrigoRadiacion: true,
                exactitudTemperaturaC: 0.2,
                fechaCalibracion: '2026-07-01T00:00:00.000Z',
                proximaCalibracion: '2027-07-01T23:59:59.999Z',
                offsetTemperaturaC: 0.4,
                fuenteCalibracion: 'Recalibracion termica julio',
                humedadRelativa: {
                  estado: 'calificado',
                  rol: 'aire_2m',
                  alturaM: 2,
                  abrigoRadiacion: true,
                  exactitud: 2.5,
                  fechaCalibracion: '2026-07-01T00:00:00.000Z',
                  proximaCalibracion: '2027-07-01T23:59:59.999Z',
                  offset: -2,
                  fuenteCalibracion: 'Recalibracion RH julio',
                },
                historialCalibraciones: [
                  {
                    id: 'cal-temp-junio',
                    variable: 'temperatura_aire',
                    version: 'calificacion-variable-v1',
                    registradoEn: '2026-06-01T12:00:00.000Z',
                    estado: 'calificado',
                    rol: 'aire_2m',
                    alturaM: 2,
                    abrigoRadiacion: true,
                    exactitud: 0.2,
                    fechaCalibracion: '2026-06-01T00:00:00.000Z',
                    proximaCalibracion: '2026-06-30T23:59:59.999Z',
                    offset: -0.7,
                    fuenteCalibracion: 'Certificado termico junio',
                  },
                  {
                    id: 'cal-rh-junio',
                    variable: 'humedad_relativa',
                    version: 'calificacion-variable-v1',
                    registradoEn: '2026-06-01T12:00:00.000Z',
                    estado: 'calificado',
                    rol: 'aire_2m',
                    alturaM: 2,
                    abrigoRadiacion: true,
                    exactitud: 2.5,
                    fechaCalibracion: '2026-06-01T00:00:00.000Z',
                    proximaCalibracion: '2026-06-30T23:59:59.999Z',
                    offset: 1,
                    fuenteCalibracion: 'Certificado RH junio',
                  },
                ],
              },
            },
          ],
        }),
        getReportes: jest.fn().mockResolvedValue({
          datos: [
            {
              fecha: '2026-06-15T03:12:00.000Z',
              datos: {
                valores: {
                  Temperatura: [{ valores: { actual: 5 } }],
                  Humedad: [{ valores: { actual: 82 } }],
                },
              },
            },
            {
              fecha: '2026-07-10T03:12:00.000Z',
              datos: {
                valores: {
                  Temperatura: [{ valores: { actual: 5 } }],
                  Humedad: [{ valores: { actual: 82 } }],
                },
              },
            },
          ],
        }),
      };
      const juneFallback = {
        ...base()[0],
        timestamp: '2026-06-15T03:00:00.000Z',
        fechaLocal: '2026-06-15',
      };
      const service = new SensorWeatherOverlayService(repository as any);

      const result = await service.overlay(
        { _id: 'lot-1' } as any,
        'est-1',
        '2026-06-01',
        [juneFallback, base()[0]],
      );

      expect(result.observations[0].valores.temperatureC).toBeCloseTo(4.3, 6);
      expect(result.observations[0].valores.relativeHumidityPct).toBe(83);
      expect(result.observations[1].valores.temperatureC).toBeCloseTo(5.4, 6);
      expect(result.observations[1].valores.relativeHumidityPct).toBe(80);
      result.fieldObservations.forEach((observation) => {
        expect(observation.banderasCalidad).toContain(
          'temperature_sensor_quality:calificado',
        );
        expect(observation.banderasCalidad).toContain(
          'humidity_sensor_quality:calificado',
        );
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('conserva el estado forecast cuando una variable canonica sigue viniendo del pronostico', async () => {
    const repository = {
      getDispositivos: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'dev-qualified-forecast',
            idLote: 'lot-1',
            nombre: 'K-02',
            calificacionMeteorologica: {
              estado: 'calificado',
              rolTemperatura: 'aire_2m',
              alturaM: 2,
              abrigoRadiacion: true,
              exactitudTemperaturaC: 0.2,
              fechaCalibracion: '2026-06-01',
              proximaCalibracion: '2027-06-01',
              fuenteCalibracion: 'Certificado laboratorio 2026-14',
            },
          },
        ],
      }),
      getReportes: jest.fn().mockResolvedValue({
        datos: [
          {
            fecha: '2026-07-10T03:12:00.000Z',
            datos: {
              valores: {
                Temperatura: [{ valores: { actual: 5 } }],
                Humedad: [{ valores: { actual: 82 } }],
              },
            },
          },
        ],
      }),
    };
    const forecastBase = base() as any;
    forecastBase[0] = {
      ...forecastBase[0],
      estado: 'forecast',
      esPronostico: true,
      valores: {
        ...forecastBase[0].valores,
        precipitationMm: 3,
      },
      fuentePorVariable: {
        ...forecastBase[0].fuentePorVariable,
        precipitationMm: 'open_meteo',
      },
    };
    const service = new SensorWeatherOverlayService(repository as any);

    const result = await service.overlay(
      { _id: 'lot-1' } as any,
      'est-1',
      '2026-07-10',
      forecastBase,
    );
    const observation = result.observations[0];

    expect(observation.valores.temperatureC).toBe(5);
    expect(observation.fuentePorVariable.temperatureC).toBe('sensor');
    expect(observation.estadoPorVariable?.temperatureC).toBe('observed');
    expect(observation.valores.precipitationMm).toBe(3);
    expect(observation.fuentePorVariable.precipitationMm).toBe('open_meteo');
    expect(observation.estadoPorVariable?.precipitationMm).toBe('forecast');
    expect(observation.fuente).toBe('mixed');
    expect(observation.estado).toBe('forecast');
    expect(observation.esPronostico).toBe(true);
  });

  it('degrada automaticamente a referencia una calibracion vencida sin perder la lectura de campo', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    try {
      const repository = {
        getDispositivos: jest.fn().mockResolvedValue({
          datos: [
            {
              _id: 'dev-expired',
              idLote: 'lot-1',
              nombre: 'K-03',
              calificacionMeteorologica: {
                estado: 'calificado',
                rolTemperatura: 'aire_2m',
                alturaM: 2,
                abrigoRadiacion: true,
                exactitudTemperaturaC: 0.2,
                fechaCalibracion: '2025-06-01',
                proximaCalibracion: '2026-06-01',
                offsetTemperaturaC: 0,
                fuenteCalibracion: 'Certificado vencido',
              },
            },
          ],
        }),
        getReportes: jest.fn().mockResolvedValue({
          datos: [
            {
              fecha: '2026-07-10T03:12:00.000Z',
              datos: {
                valores: {
                  Temperatura: [{ valores: { actual: 5 } }],
                },
              },
            },
          ],
        }),
      };
      const service = new SensorWeatherOverlayService(repository as any);

      const result = await service.overlay(
        { _id: 'lot-1' } as any,
        'est-1',
        '2026-07-10',
        base(),
      );

      expect(result.observations[0].valores.temperatureC).toBe(20);
      expect(result.observations[0].fuentePorVariable.temperatureC).toBe(
        'open_meteo',
      );
      expect(result.observations[0].banderasCalidad).toContain(
        'temperature_sensor_quality:referencia',
      );
      expect(result.fieldTemperatureDecisionReady).toBe(false);
      expect(result.unqualifiedTemperatureSensorNames).toEqual(['K-03']);
      expect(result.warnings.join(' ')).toContain('no esta vigente hoy');
    } finally {
      jest.useRealTimers();
    }
  });

  it('no aplica una calibracion futura ni su offset a lecturas historicas anteriores', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    try {
      const repository = {
        getDispositivos: jest.fn().mockResolvedValue({
          datos: [
            {
              _id: 'dev-future-calibration',
              idLote: 'lot-1',
              nombre: 'K-FUTURE',
              calificacionMeteorologica: {
                estado: 'calificado',
                rolTemperatura: 'aire_2m',
                alturaM: 2,
                abrigoRadiacion: true,
                exactitudTemperaturaC: 0.2,
                fechaCalibracion: '2026-08-01',
                proximaCalibracion: '2027-08-01',
                offsetTemperaturaC: -0.7,
                fuenteCalibracion: 'Certificado futuro',
              },
            },
          ],
        }),
        getReportes: jest.fn().mockResolvedValue({
          datos: [
            {
              fecha: '2026-07-10T03:12:00.000Z',
              datos: {
                valores: {
                  Temperatura: [{ valores: { actual: 5 } }],
                },
              },
            },
          ],
        }),
      };
      const service = new SensorWeatherOverlayService(repository as any);

      const result = await service.overlay(
        { _id: 'lot-1' } as any,
        'est-1',
        '2026-07-10',
        base(),
      );

      expect(result.observations[0].valores.temperatureC).toBe(20);
      expect(result.fieldObservations[0].valores.temperatureC).toBe(5);
      expect(result.fieldObservations[0].banderasCalidad).toContain(
        'temperature_sensor_quality:referencia',
      );
      expect(result.fieldTemperatureQuality).toBe('referencia');
    } finally {
      jest.useRealTimers();
    }
  });

  it('conserva como calificada una lectura dentro de una ventana vencida hoy y degrada solo las posteriores', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    try {
      const repository = {
        getDispositivos: jest.fn().mockResolvedValue({
          datos: [
            {
              _id: 'dev-historical-calibration',
              idLote: 'lot-1',
              nombre: 'K-HIST',
              calificacionMeteorologica: {
                estado: 'calificado',
                rolTemperatura: 'aire_2m',
                alturaM: 2,
                abrigoRadiacion: true,
                exactitudTemperaturaC: 0.2,
                fechaCalibracion: '2026-06-01',
                proximaCalibracion: '2026-06-30',
                offsetTemperaturaC: -0.7,
                fuenteCalibracion: 'Certificado historico',
              },
            },
          ],
        }),
        getReportes: jest.fn().mockResolvedValue({
          datos: [
            {
              fecha: '2026-06-15T03:12:00.000Z',
              datos: {
                valores: {
                  Temperatura: [{ valores: { actual: 5 } }],
                },
              },
            },
            {
              fecha: '2026-07-10T03:12:00.000Z',
              datos: {
                valores: {
                  Temperatura: [{ valores: { actual: 5 } }],
                },
              },
            },
          ],
        }),
      };
      const juneFallback = {
        ...base()[0],
        timestamp: '2026-06-15T03:00:00.000Z',
        fechaLocal: '2026-06-15',
      };
      const julyFallback = base()[0];
      const service = new SensorWeatherOverlayService(repository as any);

      const result = await service.overlay(
        { _id: 'lot-1' } as any,
        'est-1',
        '2026-06-01',
        [juneFallback, julyFallback],
      );

      expect(result.observations[0].fechaLocal).toBe('2026-06-15');
      expect(result.observations[0].valores.temperatureC).toBeCloseTo(4.3, 6);
      expect(result.observations[0].fuentePorVariable.temperatureC).toBe(
        'sensor',
      );
      expect(result.observations[1].fechaLocal).toBe('2026-07-10');
      expect(result.observations[1].valores.temperatureC).toBe(20);
      expect(result.observations[1].fuentePorVariable.temperatureC).toBe(
        'open_meteo',
      );
      expect(result.fieldObservations[0].valores.temperatureC).toBeCloseTo(
        4.3,
        6,
      );
      expect(result.fieldObservations[0].banderasCalidad).toContain(
        'temperature_sensor_quality:calificado',
      );
      expect(result.fieldObservations[1].valores.temperatureC).toBe(5);
      expect(result.fieldObservations[1].banderasCalidad).toContain(
        'temperature_sensor_quality:referencia',
      );
      expect(result.fieldTemperatureQuality).toBe('referencia');
      expect(result.warnings.join(' ')).toContain(
        'no invalida retrospectivamente',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('degrada una declaracion calificada incompleta y no la usa para decisiones', async () => {
    const repository = {
      getDispositivos: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'dev-incomplete',
            idLote: 'lot-1',
            nombre: 'K-05',
            calificacionMeteorologica: {
              estado: 'calificado',
              rolTemperatura: 'aire_2m',
              alturaM: 2,
              abrigoRadiacion: false,
              exactitudTemperaturaC: 0.2,
              fechaCalibracion: '2026-06-01',
              proximaCalibracion: '2027-06-01',
              fuenteCalibracion: '',
            },
          },
        ],
      }),
      getReportes: jest.fn().mockResolvedValue({
        datos: [
          {
            fecha: '2026-07-10T03:12:00.000Z',
            datos: {
              valores: {
                Temperatura: [{ valores: { actual: 6 } }],
              },
            },
          },
        ],
      }),
    };
    const service = new SensorWeatherOverlayService(repository as any);

    const result = await service.overlay(
      { _id: 'lot-1' } as any,
      'est-1',
      '2026-07-10',
      base(),
    );

    expect(result.observations[0].valores.temperatureC).toBe(20);
    expect(result.observations[0].banderasCalidad).toContain(
      'temperature_sensor_quality:referencia',
    );
    expect(result.fieldTemperatureDecisionReady).toBe(false);
    expect(result.warnings.join(' ')).toContain('no esta vigente hoy');
  });

  it('excluye variables de aire de un sensor rechazado aunque conserva sus lecturas de suelo', async () => {
    const repository = {
      getDispositivos: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'dev-rejected',
            idLote: 'lot-1',
            nombre: 'K-04',
            calificacionMeteorologica: {
              estado: 'rechazado',
              rolTemperatura: 'aire_2m',
              observaciones: 'Deriva fuera de tolerancia',
            },
          },
        ],
      }),
      getReportes: jest.fn().mockResolvedValue({
        datos: [
          {
            fecha: '2026-07-10T03:12:00.000Z',
            datos: {
              valores: {
                Temperatura: [{ valores: { actual: 5 } }],
                Humedad: [{ valores: { actual: 82 } }],
                'Temperatura Suelo': [
                  { profundidad: 20, valores: { actual: 7 } },
                ],
              },
            },
          },
        ],
      }),
    };
    const service = new SensorWeatherOverlayService(repository as any);

    const result = await service.overlay(
      { _id: 'lot-1' } as any,
      'est-1',
      '2026-07-10',
      base(19),
    );

    expect(result.observations[0].valores.temperatureC).toBe(19);
    expect(result.observations[0].valores.relativeHumidityPct).toBe(50);
    expect(result.observations[0].fuentePorVariable.temperatureC).toBe(
      'open_meteo',
    );
    expect(result.observations[0].valores.soilTemperatureC?.['20']).toBe(7);
    expect(result.fieldTemperatureDecisionReady).toBe(false);
    expect(result.warnings.join(' ')).toContain(
      'temperatura de aire esta rechazada',
    );
  });

  it('nunca usa temperatura de suelo como temperatura de aire', async () => {
    const repository = {
      getDispositivos: jest.fn().mockResolvedValue({
        datos: [{ _id: 'dev-1', idLote: 'lot-1', nombre: 'K-03' }],
      }),
      getReportes: jest.fn().mockResolvedValue({
        datos: [
          {
            fecha: '2026-07-10T03:12:00.000Z',
            datos: {
              valores: {
                'Temperatura Suelo': [
                  { profundidad: 20, valores: { actual: 7 } },
                ],
              },
            },
          },
        ],
      }),
    };
    const service = new SensorWeatherOverlayService(repository as any);

    const result = await service.overlay(
      { _id: 'lot-1' } as any,
      'est-1',
      '2026-07-10',
      base(19),
    );

    expect(result.observations[0].valores.temperatureC).toBe(19);
    expect(result.observations[0].fuentePorVariable.temperatureC).toBe(
      'open_meteo',
    );
    expect(result.observations[0].valores.soilTemperatureC?.['20']).toBe(7);
    expect(result.warnings.join(' ')).toContain(
      'nunca se sustituye con temperatura de suelo',
    );
  });

  it('lee reportes por paginas descendentes y no pierde la lectura mas nueva por una historia extensa', async () => {
    const firstPage = Array.from({ length: 5000 }, (_, index) => ({
      _id: `row-${index}`,
      fecha: new Date(Date.UTC(2026, 6, 10, 0, 0, index % 60)).toISOString(),
    }));
    firstPage[0] = {
      _id: 'newest',
      fecha: '2026-07-16T12:00:00.000Z',
    };
    const repository = {
      getReportes: jest
        .fn()
        .mockResolvedValueOnce({
          totalCount: 5001,
          datos: firstPage,
        })
        .mockResolvedValueOnce({
          totalCount: 5001,
          datos: [
            {
              _id: 'oldest',
              fecha: '2026-05-01T00:00:00.000Z',
            },
          ],
        }),
    };
    const service = new SensorWeatherOverlayService(repository as any);

    const result = await (service as any).loadReports(
      { _id: 'dev-long-history' },
      '2026-05-01T00:00:00.000Z',
      '2026-07-16T13:00:00.000Z',
    );

    expect(repository.getReportes).toHaveBeenCalledTimes(2);
    expect(repository.getReportes.mock.calls[0][0]).toMatchObject({
      page: 0,
      limit: 5000,
      sort: JSON.stringify({ fecha: -1, fechaCreacion: -1, _id: -1 }),
    });
    expect(repository.getReportes.mock.calls[1][0].page).toBe(1);
    expect(result[0]._id).toBe('oldest');
    expect(result[result.length - 1]._id).toBe('newest');
  });

  it('conserva la pagina mas nueva si una pagina historica posterior falla', async () => {
    const newest = {
      _id: 'newest-survives',
      fecha: '2026-07-16T12:00:00.000Z',
    };
    const repository = {
      getReportes: jest
        .fn()
        .mockResolvedValueOnce({
          totalCount: 9000,
          datos: Array(5000).fill(newest),
        })
        .mockRejectedValueOnce(new Error('historical page unavailable')),
    };
    const service = new SensorWeatherOverlayService(repository as any);

    const result = await (service as any).loadReports(
      { _id: 'dev-partial-history' },
      '2026-05-01T00:00:00.000Z',
      '2026-07-16T13:00:00.000Z',
    );

    expect(repository.getReportes).toHaveBeenCalledTimes(2);
    expect(result).toEqual([newest]);
  });
});
