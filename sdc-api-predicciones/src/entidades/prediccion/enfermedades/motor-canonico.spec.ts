import {
  acumularSeveridadManchaRed,
  calcularRoyaHoja,
  getEnfermedadCanonica,
  gradosDiaRoyaMaiz,
  indiceResistenciaDesdeMultiplicador,
  resolverResistencia,
  seleccionarResistenciaMasReciente,
  tasaDiariaManchaRedHoraria,
} from 'modelos/src/motores/enfermedades';

describe('motor canonico de enfermedades', () => {
  it('resuelve los alias de UI al mismo identificador estable', () => {
    expect(getEnfermedadCanonica('Roya del Maíz')?.id).toBe('maiz.roya');
    expect(getEnfermedadCanonica('Roya del Maiz')?.id).toBe('maiz.roya');
    expect(getEnfermedadCanonica('Fin de Ciclo Soja')?.id).toBe(
      'soja.fin_ciclo',
    );
    expect(getEnfermedadCanonica('SH')?.id).toBe('trigo.mancha_hoja');
  });

  it('prioriza la campaña más reciente para una misma enfermedad', () => {
    const selected = seleccionarResistenciaMasReciente(
      [
        {
          enfermedad: 'Mancha de la Hoja',
          multiplicador: 0.5,
          campaniaFuente: '2020-2021',
          estado: 'historica',
        },
        {
          idEnfermedad: 'trigo.mancha_hoja',
          enfermedad: 'Mancha de la Hoja',
          multiplicador: 0.75,
          campaniaFuente: '2025-2026',
          estado: 'observada',
        },
      ],
      'trigo.mancha_hoja',
    );
    expect(selected?.campaniaFuente).toBe('2025-2026');
    expect(selected?.multiplicador).toBe(0.75);
  });

  it('no transforma la ausencia de información en resistencia', () => {
    const resolved = resolverResistencia([], 'cebada.mancha_red');
    expect(resolved.estado).toBe('desconocida');
    expect(resolved.desconocida).toBe(true);
    expect(resolved.multiplicador).toBe(1);
    expect(resolved.indiceResistencia).toBe(0);
  });

  it('mantiene monotonicidad biológica en roya: R no supera a S', () => {
    const R = calcularRoyaHoja(20, 5, 1);
    const MR = calcularRoyaHoja(20, 5, 2 / 3);
    const MS = calcularRoyaHoja(20, 5, 1 / 3);
    const S = calcularRoyaHoja(20, 5, 0);
    expect(R).toBeLessThanOrEqual(MR);
    expect(MR).toBeLessThanOrEqual(MS);
    expect(MS).toBeLessThanOrEqual(S);
    expect(S).toBeCloseTo(19.47, 2);
  });

  it('usa la misma acumulación térmica de maíz bajo HR crítica', () => {
    expect(gradosDiaRoyaMaiz(94, 17)).toBe(0);
    expect(gradosDiaRoyaMaiz(95, 7)).toBe(0);
    expect(gradosDiaRoyaMaiz(95, 12)).toBe(4);
    expect(gradosDiaRoyaMaiz(98, 20)).toBe(9);
  });

  it('convierte el multiplicador susceptible histórico a IR=0', () => {
    expect(indiceResistenciaDesdeMultiplicador(0.05)).toBe(1);
    expect(indiceResistenciaDesdeMultiplicador(0.5)).toBeCloseTo(2 / 3);
    expect(indiceResistenciaDesdeMultiplicador(0.75)).toBeCloseTo(1 / 3);
    expect(indiceResistenciaDesdeMultiplicador(1)).toBe(0);
  });

  it('reproduce la tasa horaria del primer día del Excel de Mancha en Red', () => {
    const temperaturas = [
      6, 7, 9, 11, 23, 21, 13, 14, 6, 3, 4, 2, 9, 11, 23, 24, 31, 11,
      11, 12, 5, 6, 7, 8,
    ];
    const humedades = [
      91, 90, 88, 23, 35, 90, 91, 95, 91, 90, 88, 78, 68, 90, 91, 95,
      75, 74, 90, 91, 95, 91, 90, 88,
    ];
    const horas = temperaturas.map((temperatura, index) => ({
      temperatura,
      humedadRelativa: humedades[index],
    }));
    const tasa = tasaDiariaManchaRedHoraria(horas, 1.2);
    expect(tasa).toBeCloseTo(0.419, 3);
    expect(acumularSeveridadManchaRed(0, tasa)).toBe(0.1);
  });
});
