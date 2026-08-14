import {
  buildSentekChannelCoverage,
  buildSentekProfile,
  normalizarProfundidadSentek,
} from './sentek-profile';

describe('normalizarProfundidadSentek', () => {
  it('mantiene la escala canonica de 10 a 120 cm', () => {
    expect([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120].map(normalizarProfundidadSentek)).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
    ]);
  });

  it('traduce la rotulacion historica de 5 a 115 cm sin reescribir la evidencia', () => {
    expect([5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115].map(normalizarProfundidadSentek)).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
    ]);
  });

  it('no altera profundidades ajenas al perfil Sentek historico', () => {
    expect(normalizarProfundidadSentek(0)).toBe(0);
    expect(normalizarProfundidadSentek(130)).toBe(130);
    expect(normalizarProfundidadSentek(12.5)).toBe(12.5);
  });

  it('no inventa escalas para humedad o temperatura fuera de especificacion', () => {
    const profile = buildSentekProfile({
      datos: {
        valores: {
          'Humedad Suelo Profundidad': [
            { profundidad: 10, unidad: '%', valores: { actual: 1 } },
            { profundidad: 20, unidad: '%', valores: { actual: 300 } },
          ],
          'Temperatura Suelo': [
            { profundidad: 10, unidad: 'C', valores: { actual: 20 } },
            { profundidad: 20, unidad: 'C', valores: { actual: 250 } },
            { profundidad: 30, unidad: 'F', valores: { actual: 50 } },
          ],
        },
      },
    } as any);

    expect(profile).toEqual([
      jasmine.objectContaining({
        profundidad: 10,
        humedad: jasmine.objectContaining({ actual: 1, unidad: '%' }),
        temperatura: jasmine.objectContaining({ actual: 20, unidad: 'C' }),
      }),
    ]);
  });

  it('mantiene VIC como indice sin convertirlo falsamente a EC', () => {
    const profile = buildSentekProfile({
      datos: {
        valores: {
          'Salinidad Suelo': [{ profundidad: 10, unidad: 'VIC', valores: { actual: 1487.012 } }],
        },
      },
    } as any);

    expect(profile[0].salinidad).toEqual(
      jasmine.objectContaining({
        actual: 1487,
        unidad: 'VIC',
        crudo: 1487.012,
      })
    );
    expect(profile[0].salinidad?.nota).toContain('no equivale a EC');
  });

  it('detecta el patron real donde solo se reciben tramas del canal 12', () => {
    const coverage = buildSentekChannelCoverage(
      Array.from({ length: 8 }, (_, index) => ({
        decodeStatus: 'decoded' as const,
        devEUI: '24E124454E358347',
        profileChannels: [11],
        readings: [],
        timestamp: `2026-08-14T${String(10 + index).padStart(2, '0')}:00:00.000Z`,
      })),
    );

    expect(coverage?.completa).toBeFalse();
    expect(coverage?.canalesRecibidos).toEqual([12]);
    expect(coverage?.canalesFaltantes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(coverage?.mensaje).toContain('solo el canal SDI-12 12');
    expect(coverage?.mensaje).toContain('No se recibieron los canales 1-4 de humedad');
  });

  it('declara cobertura completa solo al observar los doce canales', () => {
    const coverage = buildSentekChannelCoverage([
      {
        decodeStatus: 'decoded',
        devEUI: 'AABBCCDD',
        profileChannels: Array.from({ length: 12 }, (_, index) => index),
        readings: [],
        timestamp: '2026-08-14T10:00:00.000Z',
      },
    ]);

    expect(coverage?.completa).toBeTrue();
    expect(coverage?.canalesFaltantes).toEqual([]);
  });
});
