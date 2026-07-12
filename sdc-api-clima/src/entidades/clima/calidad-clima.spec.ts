import {
  evaluarCoberturaClimatica,
  fusionarClimaConFallback,
} from './calidad-clima';

const row = (fecha: string, completo = true) => ({
  fecha,
  fuente: 'FieldClimate' as const,
  temperatura: completo ? { avg: 18, min: 12, max: 24 } : { avg: 18 },
  humedad: completo ? { avg: 85 } : undefined,
  lluvia: completo ? { sum: 2 } : undefined,
});

describe('calidad climática para enfermedades', () => {
  it('no acepta una serie no vacía si falta un día o una variable', () => {
    const coverage = evaluarCoberturaClimatica(
      [row('2026-07-10'), row('2026-07-11', false)],
      '2026-07-10',
      '2026-07-12',
      'daily',
    );
    expect(coverage.cobertura).toBe(0.5);
  });

  it('fusiona el día incompleto con Open-Meteo y conserva trazabilidad', () => {
    const result = fusionarClimaConFallback(
      [row('2026-07-10'), row('2026-07-11', false)],
      [
        { ...row('2026-07-11'), fuente: 'OpenMeteo' as const },
      ],
      '2026-07-10',
      '2026-07-12',
      'daily',
    );
    expect(result.coberturaFieldClimate).toBe(0.5);
    expect(result.coberturaFinal).toBe(1);
    expect(result.diasFallback).toBe(1);
    expect(result.datos.find((item) => item.fecha === '2026-07-11')?.calidadDatos?.fallback).toBe(true);
  });

  it('trata maxDate como limite superior exclusivo', () => {
    const coverage = evaluarCoberturaClimatica(
      [row('2026-07-10')],
      '2026-07-10T00:00:00.000Z',
      '2026-07-11T00:00:00.000Z',
      'daily',
    );
    expect(coverage.diasEsperados).toBe(1);
    expect(coverage.cobertura).toBe(1);
  });
});
