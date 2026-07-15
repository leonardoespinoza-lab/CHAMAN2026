import { calcularRiegoV13Estimado } from './riego-v13-fallback.engine';

describe('calcularRiegoV13Estimado', () => {
  it('no codifica como cero el agua util desconocida sin sensor', () => {
    const resultado = calcularRiegoV13Estimado({
      siembra: { fechaSiembra: '2026-07-01' } as any,
      lote: { capacidadDeRiego: 8 } as any,
      cultivo: 'Soja' as any,
      crono: { etapas: {} } as any,
      lluviaHistorica: [],
      pronostico7Dias: [
        {
          fecha: '2026-07-14',
          et0: 5,
          lluvia: 0,
          probabilidadLluvia: 0,
        },
      ] as any,
    });

    expect(resultado.estadoCalculoAguaUtil).toBe('no_disponible');
    expect(Number.isFinite(resultado.aguaUtilFacilmenteDisponibleReal)).toBe(false);
    expect(Number.isFinite(resultado.aguaUtilPct)).toBe(false);
    expect(JSON.parse(JSON.stringify(resultado))).toMatchObject({
      aguaUtilFacilmenteDisponibleReal: null,
      aguaUtilPct: null,
    });
    expect(resultado.pronosticosRiego).toHaveLength(1);
  });
});
