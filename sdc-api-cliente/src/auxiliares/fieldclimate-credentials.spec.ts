import {
  isProtectedFieldClimateCredential,
  protectFieldClimateCredential,
  revealFieldClimateCredential,
} from './fieldclimate-credentials';

describe('credenciales FieldClimate', () => {
  const previousKey = process.env.FIELDCLIMATE_CREDENTIALS_KEY;

  beforeAll(() => {
    process.env.FIELDCLIMATE_CREDENTIALS_KEY =
      'testing-only-fieldclimate-key-32-bytes';
  });

  afterAll(() => {
    if (previousKey === undefined) {
      delete process.env.FIELDCLIMATE_CREDENTIALS_KEY;
    } else {
      process.env.FIELDCLIMATE_CREDENTIALS_KEY = previousKey;
    }
  });

  it('cifra con AES-GCM y recupera el valor original', () => {
    const encrypted = protectFieldClimateCredential('clave-de-prueba');
    expect(encrypted).not.toContain('clave-de-prueba');
    expect(isProtectedFieldClimateCredential(encrypted)).toBe(true);
    expect(revealFieldClimateCredential(encrypted)).toBe('clave-de-prueba');
  });

  it('mantiene compatibilidad de lectura con credenciales legadas', () => {
    expect(revealFieldClimateCredential('texto-legado')).toBe('texto-legado');
  });
});
