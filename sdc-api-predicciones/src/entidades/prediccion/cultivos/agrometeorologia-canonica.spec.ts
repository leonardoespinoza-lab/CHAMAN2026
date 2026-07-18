import { IRespuestaAgrometeorologiaSiembra } from 'modelos/src';
import {
  construirDiasSanitariosCanonicos,
  indiceEtapaArveja,
} from './agrometeorologia-canonica';

function respuesta(
  overrides: Record<string, unknown> = {},
): IRespuestaAgrometeorologiaSiembra {
  return {
    summary: {},
    dataSource: {
      type: 'open_meteo',
      sources: ['open_meteo'],
      completenessPercentage: 100,
    },
    series: [
      {
        date: '2026-07-15',
        isForecast: false,
        stage: 'Hoja Bandera',
        stageSource: 'gdd_validado',
        stageConfidence: 'media',
        weather: {
          temperatureMinC: 5,
          temperatureMeanC: 12,
          temperatureMaxC: 19,
          relativeHumidityMeanPct: 82,
          precipitationMm: 1.2,
        },
        metrics: {
          temperatureMinC: 5,
          temperatureMeanC: 12,
          temperatureMaxC: 19,
          relativeHumidityMeanPct: 82,
          precipitationMm: 1.2,
          gddBaseTemperatureC: 0,
          gddAccumulated: 850,
          gddAccumulationComplete: true,
        },
        source: 'open_meteo',
        sourceByVariable: {},
        qualityFlags: [],
        warnings: [],
        ...overrides,
      },
    ],
    warnings: [],
    calculationVersion: 'test',
    parametersVersion: 'test',
  };
}

describe('adaptador sanitario agrometeorologico canonico', () => {
  it('habilita trigo solo con etapa GDD validada y acumulacion completa', () => {
    const [dia] = construirDiasSanitariosCanonicos(respuesta(), 'Trigo');

    expect(dia.etapaNumero).toBe(3);
    expect(dia.etapaHabilitante).toBe(true);
    expect(dia.climaHabilitante).toBe(true);
    expect(dia.clima.fuente).toBe('OpenMeteo');
  });

  it('mantiene cerrada una etapa de cronograma de referencia', () => {
    const [dia] = construirDiasSanitariosCanonicos(
      respuesta({
        stageSource: 'cronograma_referencia',
        stageConfidence: 'referencia',
      }),
      'Cebada',
    );

    expect(dia.etapaNumero).toBe(3);
    expect(dia.etapaHabilitante).toBe(false);
    expect(dia.motivosNoHabilitante.join(' ')).toContain('solo de referencia');
  });

  it('bloquea clima diario reconstruido con horas incompletas', () => {
    const [dia] = construirDiasSanitariosCanonicos(
      respuesta({
        qualityFlags: [
          'insufficient_hourly_precipitation_coverage_for_daily_total',
        ],
      }),
      'Trigo',
    );

    expect(dia.climaHabilitante).toBe(false);
    expect(dia.calidadClima.nivel).toBe('sin_datos');
  });

  it('usa una etapa de arveja observada sin recalcular Tb ni GDD local', () => {
    const [dia] = construirDiasSanitariosCanonicos(
      respuesta({
        stage: 'R1 - Inicio de floracion',
        stageSource: 'campo',
        stageConfidence: 'alta',
        metrics: {
          temperatureMinC: 5,
          temperatureMeanC: 12,
          temperatureMaxC: 19,
          relativeHumidityMeanPct: 82,
          precipitationMm: 1.2,
        },
      }),
      'Arveja',
    );

    expect(dia.etapaArveja).toBe('R1');
    expect(indiceEtapaArveja(dia.etapaArveja!)).toBe(2);
    expect(dia.etapaHabilitante).toBe(true);
  });

  it('no abre arveja con un rango termico meramente referencial', () => {
    const [dia] = construirDiasSanitariosCanonicos(
      respuesta({
        stage: 'E - R1',
        stageSource: 'rango_termico_referencia',
        stageConfidence: 'referencia',
      }),
      'Arveja',
    );

    expect(dia.etapaHabilitante).toBe(false);
  });

  it('descarta pronosticos para el motor sanitario historico', () => {
    const dias = construirDiasSanitariosCanonicos(
      respuesta({ isForecast: true }),
      'Trigo',
    );

    expect(dias).toHaveLength(0);
  });
});
