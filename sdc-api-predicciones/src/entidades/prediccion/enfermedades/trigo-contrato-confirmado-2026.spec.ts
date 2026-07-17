import {
  calcularFusariumEspigaCrudo,
  calcularManchaAmarillaCrudo,
  calcularManchaHojaCrudo,
  calcularRoyaAnaranjadaTrigo2026Crudo,
  calcularRoyaHojaTrigo2026Crudo,
  resolverVentanaSanitariaFoliarTrigo,
  TRIGO_FUSARIUM_GDD_BASE_0_MAX,
} from 'modelos/src';

describe('contrato sanitario confirmado de trigo 2026', () => {
  const factoresI = [
    ['S', 1],
    ['MS', 0.75],
    ['MR', 0.5],
    ['R', 0.05],
  ] as const;

  it.each(factoresI)('aplica I=%s (%s) sin invertirlo en Mancha Amarilla', (_perfil, I) => {
    const DPrHRT = 4;
    const DPr = 3;
    const esperado = (-2.25 + 1.62 * DPrHRT + 1.3 * DPr) * I;
    expect(calcularManchaAmarillaCrudo(DPrHRT, DPr, I)).toBeCloseTo(esperado, 10);
  });

  it.each(factoresI)('aplica I=%s (%s) sin invertirlo en Mancha de la Hoja', (_perfil, I) => {
    const DHR = 5;
    const DPr = 2;
    const esperado = (-6.41 + 0.59 * DHR + 2.79 * DPr) * I;
    expect(calcularManchaHojaCrudo(DHR, DPr, I)).toBeCloseTo(esperado, 10);
  });

  it.each(factoresI)('aplica I=%s (%s) como 1-I en Roya de la Hoja', (_perfil, I) => {
    const GD = 20;
    const DHR = 4;
    const esperado = 4.42 + 0.61 * GD + 0.57 * DHR - 30.01 * (1 - I);
    expect(calcularRoyaHojaTrigo2026Crudo(GD, DHR, I)).toBeCloseTo(esperado, 10);
  });

  it.each(factoresI)('conserva exacta en sombra la ecuacion contractual de P. striiformis para I=%s (%s)', (_perfil, I) => {
    const GD = 18;
    const DHR = 3;
    const DL = 2;
    const esperado = 5.15 + 0.72 * GD + 0.48 * DHR + 0.35 * DL - 35.2 * (1 - I);
    expect(calcularRoyaAnaranjadaTrigo2026Crudo(GD, DHR, DL, I)).toBeCloseTo(esperado, 10);
  });

  it.each(factoresI)('aplica I=%s (%s) sin invertirlo en Fusarium', (_perfil, I) => {
    const PMoj = 2;
    const GDN = 1.5;
    const esperado = (20.37 + 8.63 * PMoj - 0.49 * GDN) * I;
    expect(calcularFusariumEspigaCrudo(PMoj, GDN, I)).toBeCloseTo(esperado, 10);
  });

  it('abre de manera conservadora a 850 GDD o desde 800 con fin de macollaje observado', () => {
    expect(
      resolverVentanaSanitariaFoliarTrigo({
        gddBase0DesdeSiembra: 849,
        coberturaGdd: 1,
        etapa: 2,
        fenologiaObservada: false,
      }).activa,
    ).toBe(false);
    expect(
      resolverVentanaSanitariaFoliarTrigo({
        gddBase0DesdeSiembra: 850,
        coberturaGdd: 1,
        etapa: 2,
        fenologiaObservada: false,
      }).activa,
    ).toBe(true);
    const observada = resolverVentanaSanitariaFoliarTrigo({
      gddBase0DesdeSiembra: 800,
      coberturaGdd: 1,
      etapa: 2,
      fenologiaObservada: true,
    });
    expect(observada.activa).toBe(true);
    expect(observada.umbralGddAplicado).toBe(800);
  });

  it('mantiene 530 GDD base cero como cierre de la ventana de Fusarium', () => {
    expect(TRIGO_FUSARIUM_GDD_BASE_0_MAX).toBe(530);
  });
});
