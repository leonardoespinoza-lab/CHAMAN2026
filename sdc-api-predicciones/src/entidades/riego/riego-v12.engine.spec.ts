import {
  calcularEspesoresCapasCm,
  calcularRiegoV12,
} from './riego-v12.engine';

describe('calcularRiegoV12 - geometria fisica del perfil', () => {
  it('integra 10..120 cm como 120 cm y no como 780 cm', () => {
    const profundidades = Array.from({ length: 12 }, (_, index) =>
      (index + 1) * 10,
    );
    expect(calcularEspesoresCapasCm(profundidades)).toEqual(
      Array(12).fill(10),
    );
    expect(
      calcularEspesoresCapasCm(profundidades).reduce(
        (total, espesor) => total + espesor,
        0,
      ),
    ).toBe(120);

    const resultado = calcularRiegoV12({
      siembra: { fechaSiembra: '2026-08-01' } as any,
      lote: {
        capacidadDeCampo: 30,
        puntoMarchitez: 14,
        capacidadDeRiego: 8,
        anchoDeBulbo: 1,
        metrosLinealesHas: 10000,
        eficienciaRiego: 85,
      } as any,
      cultivo: 'Trigo',
      crono: undefined as any,
      suelo: profundidades.map((profundidad, index) => ({
        numeroDeSensor: index + 1,
        profundidad,
        capacidadDeCampo: 30,
        puntoMarchitez: 14,
        hayRaices: true,
      })),
      humedadSuelo: [
        {
          fecha: '2026-08-15T11:00:00.000Z',
          humedadSuelo: Object.fromEntries(
            profundidades.map((profundidad) => [
              profundidad,
              { last: 30 },
            ]),
          ),
        },
      ] as any,
      lluviaHistorica: [
        { fecha: '2026-08-15T10:00:00.000Z', lluvia: { last: 0 } },
      ] as any,
      pronostico7Dias: [0, 1, 2].map((dia) => ({
        fecha: `2026-08-${15 + dia}`,
        et0: 3,
        lluvia: 0,
        probabilidadLluvia: 0,
      })) as any,
    });

    // TAW = (0,30 - 0,14) * 1.200 mm = 192 mm.
    expect(resultado.aguaUtilFacilmenteDisponibleReal).toBe(192);
    expect(
      resultado.nivelesLecturaSensor.reduce(
        (total, nivel) => total + (nivel.aguaUtil || 0),
        0,
      ),
    ).toBe(192);
    expect(resultado.capacidadRetencionTotal).toBe(360);
  });
});
