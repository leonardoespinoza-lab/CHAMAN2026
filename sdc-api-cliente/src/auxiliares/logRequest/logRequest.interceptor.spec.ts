import { requestBodyForLog } from './logRequest.interceptor';

describe('requestBodyForLog', () => {
  it('resume el catálogo sin registrar variedades ni perfiles', () => {
    const body = {
      formatoVersion: 'chaman-cultivos-ancho-v1',
      modo: 'confirmar',
      planHash: 'v1-token-operativo',
      filas: [
        { variedad: 'DM ACACIA', perfiles: { roya: 'R' } },
        { variedad: 'DM RADAL', perfiles: { roya: 'MR' } },
      ],
    };

    expect(requestBodyForLog('/api/semillas/importar', body)).toEqual({
      formatoVersion: 'chaman-cultivos-ancho-v1',
      modo: 'confirmar',
      planHash: '[present]',
      filas: 2,
    });
  });

  it('mantiene el saneamiento de secretos en los demás endpoints', () => {
    expect(
      requestBodyForLog('/auth', { username: 'admin', password: 'clave' }),
    ).toEqual({
      username: 'admin',
      password: '[redacted]',
    });
  });
});
