export type PhenologyCropArchitecture = 'cereal' | 'legume' | 'tuber' | 'vine' | 'tree' | 'herb';

export type PhenologyVisualPhase = 'implantation' | 'vegetative' | 'reproductive' | 'maturity' | 'harvest' | 'rest';

const ARCHITECTURE_BY_CROP: Record<string, PhenologyCropArchitecture> = {
  trigo: 'cereal',
  cebada: 'cereal',
  maiz: 'cereal',
  soja: 'legume',
  arveja: 'legume',
  papa: 'tuber',
  vid: 'vine',
  manzano: 'tree',
  peral: 'tree',
  pecan: 'tree',
};

export function phenologyCropArchitecture(crop?: string): PhenologyCropArchitecture {
  return ARCHITECTURE_BY_CROP[normalize(crop)] || 'herb';
}

export function phenologyVisualPhase(stageName: string, index: number, total: number): PhenologyVisualPhase {
  const value = normalize(stageName);

  if (includesAny(value, ['dormancia', 'reposo', 'nueva campania'])) return 'rest';
  if (includesAny(value, ['cosecha', 'senescencia'])) return 'harvest';
  if (includesAny(value, ['madurez', 'r7', 'fisiologica'])) return 'maturity';
  if (
    includesAny(value, [
      'floracion',
      'antesis',
      'espigazon',
      'polinizacion',
      'cuaje',
      'envero',
      'llenado',
      'tuberizacion',
      'fruto',
      'nuez',
      'r1',
      'r3',
      'r5',
    ])
  ) {
    return 'reproductive';
  }
  if (index === 0 || includesAny(value, ['siembra', 'plantacion', 'germinacion', 'emergencia', 'brotacion', 'yema'])) {
    return 'implantation';
  }
  if (total > 1 && index === total - 1) return 'maturity';
  return 'vegetative';
}

export function phenologyGrowthPercent(index: number, total: number, phase: PhenologyVisualPhase): number {
  const normalizedIndex = total <= 1 ? 1 : Math.max(0, Math.min(1, index / (total - 1)));
  const base = 30 + normalizedIndex * 70;
  if (phase === 'implantation') return Math.min(48, base);
  if (phase === 'rest') return 46;
  if (phase === 'harvest') return 88;
  return Math.max(48, Math.min(100, base));
}

export function phenologyVisualPhaseLabel(phase: PhenologyVisualPhase): string {
  const labels: Record<PhenologyVisualPhase, string> = {
    implantation: 'Implantacion',
    vegetative: 'Etapa vegetativa',
    reproductive: 'Etapa reproductiva',
    maturity: 'Madurez',
    harvest: 'Cosecha',
    rest: 'Reposo',
  };
  return labels[phase];
}

function normalize(value?: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .trim();
}

function includesAny(value: string, candidates: string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate));
}
