import { normalizedLoginOrigin } from './login-origin';

describe('normalizedLoginOrigin', () => {
  it('toma solamente la primera IP reenviada', () => {
    expect(
      normalizedLoginOrigin({
        headers: {
          'x-forwarded-for': '198.51.100.20, 10.0.0.2',
        },
        ip: '10.0.0.3',
        socket: {},
      } as any),
    ).toBe('198.51.100.20');
  });

  it('descarta valores no IP y usa el origen de la conexion', () => {
    expect(
      normalizedLoginOrigin({
        headers: {
          'x-forwarded-for': 'valor-invalido\r\nX-Inyectado: si',
        },
        ip: '203.0.113.8',
        socket: {},
      } as any),
    ).toBe('203.0.113.8');
  });
});
