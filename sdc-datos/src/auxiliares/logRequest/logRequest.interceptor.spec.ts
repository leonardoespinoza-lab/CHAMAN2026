import { requestBodyForLog, sanitizeLogData } from './logRequest.interceptor';

describe('sanitizeLogData', () => {
  it('omite arrays masivos y conserva su cantidad para trazabilidad', () => {
    const payload = Array.from({ length: 100 }, (_, index) => ({
      index,
      value: 'meteorological-payload',
    }));

    expect(sanitizeLogData(payload)).toBe('[omitted-array:100]');
  });

  it('continua redactando secretos en payloads pequenos', () => {
    expect(sanitizeLogData([{ token: 'secret', value: 2 }])).toEqual([
      { token: '[redacted]', value: 2 },
    ]);
  });

  it('resume la importacion del catalogo sin registrar las filas', () => {
    expect(
      requestBodyForLog('/semillas/importar', {
        formatoVersion: 'chaman-cultivos-ancho-v1',
        modo: 'previsualizar',
        filas: Array.from({ length: 770 }, (_, index) => ({ index })),
      }),
    ).toEqual({
      formatoVersion: 'chaman-cultivos-ancho-v1',
      modo: 'previsualizar',
      planHash: undefined,
      filas: 770,
    });
  });
});
