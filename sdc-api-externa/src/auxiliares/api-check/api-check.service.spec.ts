import { buildHealthUrl } from './api-check.service';

describe('buildHealthUrl', () => {
  it.each([
    [
      'http://testing-predicciones.railway.internal:5007/sdc-predicciones',
      'http://testing-predicciones.railway.internal:5007/health',
    ],
    [
      'http://testing-clima.railway.internal:5008/clima/',
      'http://testing-clima.railway.internal:5008/health',
    ],
    [
      'https://datos.example.test',
      'https://datos.example.test/health',
    ],
  ])('resolves %s against the service root', (input, expected) => {
    expect(buildHealthUrl(input)).toBe(expected);
  });
});
