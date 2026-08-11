import { internalTokenMatches } from './app-hardening';

describe('app hardening de predicciones', () => {
  it('solo reconoce el secreto interno exacto y no acepta valores vacios', () => {
    expect(internalTokenMatches('token-interno', 'token-interno')).toBe(true);
    expect(internalTokenMatches('token-incorrecto', 'token-interno')).toBe(
      false,
    );
    expect(internalTokenMatches('', 'token-interno')).toBe(false);
    expect(internalTokenMatches('token-interno', '')).toBe(false);
    expect(internalTokenMatches(undefined, 'token-interno')).toBe(false);
  });
});
