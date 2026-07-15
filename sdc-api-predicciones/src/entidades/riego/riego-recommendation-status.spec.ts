import { resolverEstadoRecomendacionRiego } from './riego-recommendation-status';

describe('resolverEstadoRecomendacionRiego', () => {
  it('separa una recomendacion climatica estimada del agua util no disponible', () => {
    expect(
      resolverEstadoRecomendacionRiego({
        pronosticosRiego: [{ fecha: '2026-07-14', regar: true }] as any,
        estadoCalculoAguaUtil: 'no_disponible',
        calidadDatos: {
          nivel: 'media',
          fuente: 'mixto',
          cobertura: 1,
          fallback: true,
          resumen: 'Balance climatico sin sensor.',
          limitaciones: [],
        },
      }),
    ).toEqual({
      estado: 'estimada',
      fuente: 'balance_climatico',
      motivo: 'Balance climatico sin sensor.',
    });
  });

  it('clasifica una serie operativa como calculada', () => {
    expect(
      resolverEstadoRecomendacionRiego({
        pronosticosRiego: [{ fecha: '2026-07-14', regar: false }] as any,
        estadoCalculoAguaUtil: 'calculado',
        calidadDatos: {
          nivel: 'alta',
          fuente: 'sensor_campo',
          cobertura: 1,
          fallback: false,
          resumen: 'Lectura de sensor vigente.',
          limitaciones: [],
        },
      }),
    ).toMatchObject({
      estado: 'calculada',
      fuente: 'sensor_suelo',
    });
  });

  it('no confunde una ejecucion fallida sin serie con cero recomendado', () => {
    expect(
      resolverEstadoRecomendacionRiego({
        pronosticosRiego: [],
        estadoCalculoAguaUtil: 'fallida',
      }).estado,
    ).toBe('fallida');
  });
});
