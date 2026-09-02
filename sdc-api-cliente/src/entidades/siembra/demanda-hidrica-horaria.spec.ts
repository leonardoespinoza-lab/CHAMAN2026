import {
  calcularPotencialHidricoAireMpa,
  evaluarDemandaHidricaHora,
  ISerieAgrometeorologicaDia,
  ISerieAgrometeorologicaHora,
  resolverEstadoEstomatico,
  resolverFaseDemandaHidrica,
  resumirVentanasAperturaEstomatica,
} from 'modelos/src';

function hour(
  weather: ISerieAgrometeorologicaHora['weather'],
  timestamp = '2026-09-02T15:00:00.000Z',
): ISerieAgrometeorologicaHora {
  return {
    timestamp,
    localDate: '2026-09-02',
    timezone: 'America/Argentina/Buenos_Aires',
    isForecast: false,
    state: 'observed',
    weather,
    source: 'sensor',
    sourceByVariable: {},
    qualityFlags: [],
    completenessPercentage: 100,
  };
}

function day(stage: string): ISerieAgrometeorologicaDia {
  return {
    date: '2026-09-02',
    isForecast: false,
    stage,
    weather: {},
    metrics: { availableWaterPercentage: 62 },
    source: 'sensor',
    sourceByVariable: {},
    qualityFlags: [],
    warnings: [],
  };
}

describe('demanda hidrica horaria', () => {
  it('evalua el VPD diurno con el umbral del cultivo y conserva la etapa', () => {
    const result = evaluarDemandaHidricaHora(
      hour({
        temperatureC: 28,
        relativeHumidityPct: 42,
        vpdKpa: 1.8,
        shortwaveRadiationWm2: 520,
      }),
      'Trigo',
      day('Antesis'),
    );

    expect(result.level).toBe('high');
    expect(result.phase).toBe('reproductive');
    expect(result.vpdThresholdKpa).toBe(1.6);
    expect(result.availableWaterPercentage).toBe(62);
    expect(result.source).toBe('sensor');
    expect(result.stomatalState).toBe('regulated');
  });

  it('no interpreta la noche con umbrales de estres diurno', () => {
    const result = evaluarDemandaHidricaHora(
      hour({
        temperatureC: 24,
        relativeHumidityPct: 20,
        vpdKpa: 4,
        shortwaveRadiationWm2: 0,
      }),
      'Soja',
      day('Desarrollo vegetativo'),
    );

    expect(result.isDaylight).toBe(false);
    expect(result.level).toBe('night');
    expect(result.stomatalState).toBe('closed');
    expect(result.interpretation).toContain(
      'actividad estomatica suele estar reducida',
    );
  });

  it('desactiva la lectura fisiologica durante reposo o cosecha', () => {
    const result = evaluarDemandaHidricaHora(
      hour({ vpdKpa: 2.8, shortwaveRadiationWm2: 480 }),
      'Manzano',
      day('Reposo invernal'),
    );

    expect(result.phase).toBe('rest');
    expect(result.level).toBe('not_evaluated');
  });

  it('calcula VPD desde temperatura y humedad cuando no viene informado', () => {
    const result = evaluarDemandaHidricaHora(
      hour({
        temperatureC: 24,
        relativeHumidityPct: 50,
        shortwaveRadiationWm2: 300,
      }),
      'Maiz',
      day('Desarrollo vegetativo'),
    );

    expect(result.vpdKpa).toBeGreaterThan(1.4);
    expect(result.vpdKpa).toBeLessThan(1.6);
    expect(result.level).toBe('expected');
    expect(result.stomatalState).toBe('open');
  });

  it('clasifica las fases fenologicas sin asumir una etapa inexistente', () => {
    expect(resolverFaseDemandaHidrica('Emergencia')).toBe('implantation');
    expect(resolverFaseDemandaHidrica('Floracion y cuaje')).toBe(
      'reproductive',
    );
    expect(resolverFaseDemandaHidrica(undefined)).toBe('unknown');
  });

  it('deriva el potencial hidrico del aire sin atribuirlo a la planta', () => {
    expect(calcularPotencialHidricoAireMpa(24, 33)).toBeCloseTo(-152, 0);
    expect(calcularPotencialHidricoAireMpa(24, 90)).toBeCloseTo(-14.5, 0);
    expect(calcularPotencialHidricoAireMpa(24, 0)).toBeUndefined();
  });

  it('considera luz, etapa, VPD y reserva para estimar el estado estomatico', () => {
    expect(resolverEstadoEstomatico(true, 'vegetative', 1.2, 1.8, 60)).toBe(
      'open',
    );
    expect(resolverEstadoEstomatico(true, 'vegetative', 2, 1.8, 60)).toBe(
      'regulated',
    );
    expect(resolverEstadoEstomatico(true, 'vegetative', 1.2, 1.8, 12)).toBe(
      'regulated',
    );
    expect(resolverEstadoEstomatico(false, 'vegetative', 1.2, 1.8, 60)).toBe(
      'closed',
    );
    expect(resolverEstadoEstomatico(true, 'rest', 1.2, 1.8, 60)).toBe(
      'not_evaluated',
    );
  });

  it('resume ventanas separadas y no duplica una misma hora abierta', () => {
    const openAt = (timestamp: string) => ({
      ...evaluarDemandaHidricaHora(
        hour(
          {
            temperatureC: 24,
            relativeHumidityPct: 55,
            vpdKpa: 1.2,
            shortwaveRadiationWm2: 300,
          },
          timestamp,
        ),
        'Trigo',
        day('Emergencia'),
      ),
      timestamp,
    });
    const windows = resumirVentanasAperturaEstomatica([
      openAt('2026-09-02T11:00:00.000Z'),
      openAt('2026-09-02T12:00:00.000Z'),
      openAt('2026-09-02T12:00:00.000Z'),
      openAt('2026-09-02T16:00:00.000Z'),
    ]);

    expect(windows).toEqual([
      expect.objectContaining({
        desde: '2026-09-02T11:00:00.000Z',
        hasta: '2026-09-02T13:00:00.000Z',
        durationHours: 2,
      }),
      expect.objectContaining({
        desde: '2026-09-02T16:00:00.000Z',
        hasta: '2026-09-02T17:00:00.000Z',
        durationHours: 1,
      }),
    ]);
  });
});
