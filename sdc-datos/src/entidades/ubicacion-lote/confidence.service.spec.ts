import { LotLocationConfidenceService } from './confidence.service';

describe('LotLocationConfidenceService', () => {
  const service = new LotLocationConfidenceService();

  it('asigna alta solo con cobertura completa, sin fallback ni advertencias', () => {
    expect(
      service.calculate({
        provinceCoverage: 99.9,
        admin2Coverage: 99.5,
        usedPointFallback: false,
        warnings: [],
        hasProvince: true,
        hasAdmin2: true,
      }).level,
    ).toBe('alta');
  });

  it('degrada cruces parciales y fallback de punto de forma explicable', () => {
    expect(
      service.calculate({
        provinceCoverage: 100,
        admin2Coverage: 85,
        usedPointFallback: false,
        warnings: ['Cruce'],
        hasProvince: true,
        hasAdmin2: true,
      }).level,
    ).toBe('media');
    const fallback = service.calculate({
      provinceCoverage: 100,
      admin2Coverage: 100,
      usedPointFallback: true,
      warnings: [],
      hasProvince: true,
      hasAdmin2: true,
    });
    expect(fallback.level).toBe('baja');
    expect(fallback.reasons.join(' ')).toContain('punto representativo');
  });
});
