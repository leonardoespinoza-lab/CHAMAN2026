import {
  evaluarCoberturaClimatica,
  fusionarClimaConFallback,
  marcarResolucionOpenMeteo,
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
      [{ ...row('2026-07-11'), fuente: 'OpenMeteo' as const }],
      '2026-07-10',
      '2026-07-12',
      'daily',
    );
    expect(result.coberturaFieldClimate).toBe(0.5);
    expect(result.coberturaFinal).toBe(1);
    expect(result.diasFallback).toBe(1);
    expect(
      result.datos.find((item) => item.fecha === '2026-07-11')?.calidadDatos
        ?.fallback,
    ).toBe(true);
  });

  it('distingue una central asignada de una estacion cercana heredada', () => {
    const asociada = fusionarClimaConFallback(
      [row('2026-07-10')],
      [],
      '2026-07-10',
      '2026-07-11',
      'daily',
      'estacion_asignada',
    );
    const cercana = fusionarClimaConFallback(
      [row('2026-07-10')],
      [],
      '2026-07-10',
      '2026-07-11',
      'daily',
    );

    expect(asociada.datos[0].calidadDatos?.fuente).toBe('estacion_asignada');
    expect(cercana.datos[0].calidadDatos?.fuente).toBe('estacion_cercana');
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

  it('conserva el fallback horario cuando Open-Meteo aporta al menos 18 horas validas', () => {
    const hourly = Array.from({ length: 18 }, (_, hour) =>
      marcarResolucionOpenMeteo(
        {
          ...row(`2026-07-10T${String(hour).padStart(2, '0')}:00:00-03:00`),
          fuente: 'OpenMeteo' as const,
        },
        'hourly',
      ),
    );

    const result = fusionarClimaConFallback(
      [],
      hourly,
      '2026-07-10',
      '2026-07-11',
      'hourly',
    );

    expect(result.datos).toHaveLength(18);
    expect(result.diasFallbackHorario).toBe(1);
    expect(result.diasFallbackDiario).toBe(0);
    expect(result.datos[0].calidadDatos?.cobertura).toBe(0.75);
    expect(result.datos[0].calidadDatos?.limitaciones).not.toContain(
      'La serie horaria de Open-Meteo no estuvo disponible o no alcanzo 18 horas validas; se usa el agregado diario.',
    );
  });

  it('usa el agregado diario solo si el fallback horario no completa 18 horas', () => {
    const hourly = Array.from({ length: 17 }, (_, hour) =>
      marcarResolucionOpenMeteo(
        {
          ...row(`2026-07-10T${String(hour).padStart(2, '0')}:00:00-03:00`),
          fuente: 'OpenMeteo' as const,
        },
        'hourly',
      ),
    );
    const daily = marcarResolucionOpenMeteo(
      { ...row('2026-07-10T12:00:00.000Z'), fuente: 'OpenMeteo' as const },
      'daily',
    );

    const result = fusionarClimaConFallback(
      [],
      [...hourly, daily],
      '2026-07-10',
      '2026-07-11',
      'hourly',
    );

    expect(result.datos).toHaveLength(1);
    expect(result.diasFallbackHorario).toBe(0);
    expect(result.diasFallbackDiario).toBe(1);
    expect(result.datos[0].calidadDatos?.limitaciones).toContain(
      'La serie horaria de Open-Meteo no estuvo disponible o no alcanzo 18 horas validas; se usa el agregado diario.',
    );
  });

  it('no cuenta null como una medicion horaria valida', () => {
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      ...row(`2026-07-10T${String(hour).padStart(2, '0')}:00:00-03:00`),
      humedad: hour < 7 ? { avg: null } : { avg: 85 },
    }));

    const coverage = evaluarCoberturaClimatica(
      hourly as any,
      '2026-07-10',
      '2026-07-11',
      'hourly',
    );

    expect(coverage.cobertura).toBe(0);
  });

  it('no infla cobertura con horas duplicadas del mismo instante', () => {
    const duplicadas = Array.from({ length: 18 }, () =>
      row('2026-07-10T00:00:00-03:00'),
    );

    const coverage = evaluarCoberturaClimatica(
      duplicadas,
      '2026-07-10',
      '2026-07-11',
      'hourly',
    );

    expect(coverage.diasCompletos).toBe(0);
    expect(coverage.cobertura).toBe(0);
  });

  it('declara 18 de 24 horas FieldClimate como calidad media y cobertura real', () => {
    const fieldClimate = Array.from({ length: 18 }, (_, hour) =>
      row(`2026-07-10T${String(hour).padStart(2, '0')}:00:00-03:00`),
    );

    const result = fusionarClimaConFallback(
      fieldClimate,
      [],
      '2026-07-10',
      '2026-07-11',
      'hourly',
      'estacion_asignada',
    );

    expect(result.datos).toHaveLength(18);
    expect(result.datos[0].calidadDatos).toMatchObject({
      nivel: 'media',
      fuente: 'estacion_asignada',
      cobertura: 0.75,
      fallback: false,
    });
    expect(result.datos[0].calidadDatos?.limitaciones).toContain(
      'Serie horaria parcial de FieldClimate: 18 de 24 horas validas; se acepta por superar el minimo operativo de 18 horas.',
    );
  });

  it('reserva calidad alta FieldClimate para 24 de 24 horas unicas', () => {
    const fieldClimate = Array.from({ length: 24 }, (_, hour) =>
      row(`2026-07-10T${String(hour).padStart(2, '0')}:00:00-03:00`),
    );

    const result = fusionarClimaConFallback(
      fieldClimate,
      [],
      '2026-07-10',
      '2026-07-11',
      'hourly',
      'estacion_asignada',
    );

    expect(result.datos).toHaveLength(24);
    expect(result.datos[0].calidadDatos).toMatchObject({
      nivel: 'alta',
      fuente: 'estacion_asignada',
      cobertura: 1,
      fallback: false,
    });
    expect(result.datos[0].calidadDatos?.limitaciones).toEqual([]);
  });

  it('descarta FieldClimate con menos de 18 horas y activa fallback', () => {
    const fieldClimate = Array.from({ length: 17 }, (_, hour) =>
      row(`2026-07-10T${String(hour).padStart(2, '0')}:00:00-03:00`),
    );
    const daily = marcarResolucionOpenMeteo(
      { ...row('2026-07-10T12:00:00.000Z'), fuente: 'OpenMeteo' as const },
      'daily',
    );

    const result = fusionarClimaConFallback(
      fieldClimate,
      [daily],
      '2026-07-10',
      '2026-07-11',
      'hourly',
      'estacion_asignada',
    );

    expect(result.diasFieldClimate).toBe(0);
    expect(result.diasFallbackDiario).toBe(1);
    expect(result.datos).toHaveLength(1);
    expect(result.datos[0].calidadDatos?.fuente).toBe('open_meteo');
  });
});
