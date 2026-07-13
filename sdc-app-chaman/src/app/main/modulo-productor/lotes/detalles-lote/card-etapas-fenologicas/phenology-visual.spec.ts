import { CULTIVOS_DISPONIBLES } from 'modelos/src';
import {
  phenologyCropArchitecture,
  phenologyGrowthPercent,
  phenologyVisualPhase,
  phenologyVisualPhaseLabel,
} from './phenology-visual';

describe('phenology visual system', () => {
  it('clasifica todos los cultivos disponibles con una arquitectura visual explicita', () => {
    const expected = {
      Trigo: 'cereal',
      Cebada: 'cereal',
      Maiz: 'cereal',
      Soja: 'legume',
      Arveja: 'legume',
      Papa: 'tuber',
      Vid: 'vine',
      Manzano: 'tree',
      Peral: 'tree',
      Pecan: 'tree',
    };

    expect(CULTIVOS_DISPONIBLES.length).toBe(10);
    for (const crop of CULTIVOS_DISPONIBLES) {
      expect(phenologyCropArchitecture(crop)).toBe(expected[crop]);
    }
  });

  it('distingue implantacion, vegetativo, reproductivo, madurez, cosecha y reposo', () => {
    expect(phenologyVisualPhase('Siembra - emergencia', 0, 6)).toBe('implantation');
    expect(phenologyVisualPhase('Desarrollo vegetativo', 2, 6)).toBe('vegetative');
    expect(phenologyVisualPhase('Floracion y cuaje', 3, 6)).toBe('reproductive');
    expect(phenologyVisualPhase('Madurez fisiologica', 4, 6)).toBe('maturity');
    expect(phenologyVisualPhase('Cosecha', 5, 6)).toBe('harvest');
    expect(phenologyVisualPhase('Reposo invernal', 0, 8)).toBe('rest');
  });

  it('mantiene una progresion de tamano acotada y etiquetas legibles', () => {
    expect(phenologyGrowthPercent(0, 8, 'implantation')).toBeGreaterThanOrEqual(30);
    expect(phenologyGrowthPercent(7, 8, 'maturity')).toBe(100);
    expect(phenologyGrowthPercent(4, 8, 'reproductive')).toBeLessThanOrEqual(100);
    expect(phenologyVisualPhaseLabel('reproductive')).toBe('Etapa reproductiva');
  });
});
