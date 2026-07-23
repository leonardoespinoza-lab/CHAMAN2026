import { resolveAuthDatosTimeoutMs } from './env';

describe('timeout Auth -> Datos', () => {
  it('usa ocho segundos por defecto', () => {
    expect(resolveAuthDatosTimeoutMs()).toBe(8000);
    expect(resolveAuthDatosTimeoutMs('invalido')).toBe(8000);
  });

  it('acepta solamente valores razonables', () => {
    expect(resolveAuthDatosTimeoutMs('5000')).toBe(5000);
    expect(resolveAuthDatosTimeoutMs('999')).toBe(8000);
    expect(resolveAuthDatosTimeoutMs('30001')).toBe(8000);
  });
});
