import { evaluarRiegoMapa } from './mapa-riego-evidence';

describe('evidencia de riego del mapa', () => {
  it('no clasifica como no regar una serie legacy sin balance hidrico valido', () => {
    const resultado = evaluarRiegoMapa({
      siembra: {
        estadoCalculoAguaUtil: 'no_disponible',
        ultimaPrediccionRiego: [{ fecha: '2026-07-17', cantidad: 0 }],
      },
    } as any);

    expect(resultado).toEqual({ estado: 'sin_datos', suma: null });
  });

  it('distingue cero valido de ausencia de evidencia', () => {
    const resultado = evaluarRiegoMapa({
      siembra: {
        estadoCalculoAguaUtil: 'estimado',
        estadoRecomendacionRiego: 'estimada',
        fuenteRecomendacionRiego: 'balance_climatico',
        aguaUtilReal: 42,
        ultimaPrediccionRiego: [{ fecha: '2026-07-17', cantidad: 0 }],
      },
    } as any);

    expect(resultado).toEqual({ estado: 'sin_aporte', suma: 0 });
  });
});
