import { resolverEstadoRecomendacionRiego } from './riego-recommendation-status';

describe('resolverEstadoRecomendacionRiego', () => {
  it('no publica una serie climatica si el agua util no esta disponible', () => {
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
      estado: 'no_disponible',
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

  it('bloquea una serie con sensor si la cobertura no es completa', () => {
    expect(
      resolverEstadoRecomendacionRiego({
        pronosticosRiego: [{ fecha: '2026-07-14', regar: false }] as any,
        estadoCalculoAguaUtil: 'calculado',
        calidadDatos: {
          nivel: 'alta',
          fuente: 'sensor_campo',
          cobertura: 0.92,
          fallback: false,
          resumen: 'Perfil parcial.',
          limitaciones: ['Falta una profundidad.'],
        },
      }).estado,
    ).toBe('no_disponible');
  });
});
