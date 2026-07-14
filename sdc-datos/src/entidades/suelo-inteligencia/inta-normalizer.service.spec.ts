import { IntaSoilTextNormalizer } from './inta-normalizer.service';

describe('IntaSoilTextNormalizer', () => {
  const service = new IntaSoilTextNormalizer();

  test.each([
    ['ARCILLOSO', 'Arcilloso'],
    ['arcillo-limosa', 'Arcilloso'],
    ['franco arcilloso', 'Franco arcilloso'],
    ['Franco-arcillo-limoso', 'Franco arcilloso'],
    ['franco limosa', 'Franco limoso'],
    ['LIMOS', 'Limoso'],
    ['franco arenoso', 'Franco arenoso'],
    ['arena franca', 'Franco arenoso'],
    ['areno franco', 'Franco arenoso'],
    ['arenosa', 'Arenoso'],
    ['franca', 'Franco'],
  ])('normaliza %s', (value, expected) => {
    expect(service.normalizeTexture(value)).toBe(expected);
  });

  test.each([
    'textura pesada',
    'textura media',
    'textura liviana',
    'suelo fino',
    'suelo grueso',
    'No determinada',
  ])('no inventa una clase para %s', (value) => {
    expect(service.normalizeTexture(value)).toBeNull();
  });

  it('no deriva drenaje desde textura y tolera textos explicitos', () => {
    expect(service.normalizeDrainage('Franco arenoso')).toBe('unknown');
    expect(service.normalizeDrainage('Moderadamente bien drenado')).toBe(
      'moderately_well',
    );
    expect(service.normalizeDrainage('Pobremente drenado')).toBe('poor');
  });
});
